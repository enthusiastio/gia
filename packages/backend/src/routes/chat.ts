import { Router, Request, Response } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (
  buf: Buffer,
) => Promise<{ text: string }> = require("pdf-parse");
import { requireAuth } from "../middleware/auth";
import knex from "../db/knex";
import { getAIProvider } from "../services/ai";
import { ChatMessage } from "../services/ai/types";
import { createLogger } from "../logger";
import { v4 as uuidv4 } from "uuid";
import {
  buildContext,
  CONTEXT_INSTRUCTIONS,
  Source,
} from "../services/documents/retrieval";

const router = Router();
router.use(requireAuth);

const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";
const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB ?? "50", 10);

const imageStorage = multer.diskStorage({
  destination: path.join(uploadDir, "images"),
  filename: (_req, file, cb) =>
    cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage: imageStorage,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

async function extractAttachmentText(
  file: Express.Multer.File,
): Promise<string | null> {
  try {
    if (file.mimetype === "application/pdf") {
      const data = await pdfParse(fs.readFileSync(file.path));
      return data.text;
    }
    if (
      file.mimetype.startsWith("text/") ||
      ["application/json", "application/csv"].includes(file.mimetype)
    ) {
      return fs.readFileSync(file.path, "utf8");
    }
  } catch {
    /* ignore unreadable attachments */
  }
  return null;
}

router.get("/conversations", async (req: Request, res: Response) => {
  const conversations = await knex("conversations")
    .where({ user_id: req.user!.id })
    .orderBy("updated_at", "desc")
    .select("id", "title", "created_at", "updated_at");
  res.json(conversations);
});

router.post("/conversations", async (req: Request, res: Response) => {
  const [conv] = await knex("conversations")
    .insert({ user_id: req.user!.id, title: "New conversation" })
    .returning("*");
  res.status(201).json(conv);
});

router.delete("/conversations/:id", async (req: Request, res: Response) => {
  await knex("conversations")
    .where({ id: req.params.id, user_id: req.user!.id })
    .delete();
  res.json({ ok: true });
});

router.get(
  "/conversations/:id/messages",
  async (req: Request, res: Response) => {
    const [conv] = await knex("conversations").where({
      id: req.params.id,
      user_id: req.user!.id,
    });
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const messages = await knex("messages")
      .where({ conversation_id: req.params.id })
      .orderBy("created_at", "asc")
      .select("id", "role", "content", "image_path", "sources", "created_at");
    res.json(messages);
  },
);

const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "attachment", maxCount: 1 },
]);

router.post(
  "/conversations/:id/messages",
  (req, res, next) => {
    uploadFields(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        res.status(413).json({
          error:
            err.code === "LIMIT_FILE_SIZE"
              ? `File too large (max ${maxSizeMB}MB)`
              : err.message,
        });
        return;
      }
      if (err) {
        res.status(400).json({ error: String(err) });
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    const [conv] = await knex("conversations").where({
      id: req.params.id,
      user_id: req.user!.id,
    });
    if (!conv) {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const userText: string = req.body.content ?? "";
    const files = req.files as
      | Record<string, Express.Multer.File[]>
      | undefined;
    const imageFile = files?.["image"]?.[0];
    const attachmentFile = files?.["attachment"]?.[0];
    const imagePath = imageFile
      ? path.relative(uploadDir, imageFile.path)
      : null;

    const attachmentText = attachmentFile
      ? await extractAttachmentText(attachmentFile)
      : null;
    if (attachmentFile) fs.unlink(attachmentFile.path, () => {});
    const effectiveUserText = attachmentText
      ? `[Attached file: ${attachmentFile!.originalname}]\n${attachmentText}\n\n${userText}`.trim()
      : userText;

    await knex("messages").insert({
      conversation_id: conv.id,
      role: "user",
      content: effectiveUserText,
      image_path: imagePath,
    });

    const history = await knex("messages")
      .where({ conversation_id: conv.id })
      .orderBy("created_at", "asc")
      .select("role", "content", "image_path");

    const [userConfig] = await knex("user_configs").where({
      user_id: req.user!.id,
    });
    const model =
      userConfig?.model || process.env.DEFAULT_MODEL || "claude-opus-4-8";
    const modelProvider = userConfig?.model_provider ?? null;
    const basePrompt =
      userConfig?.system_prompt ?? "You are a helpful assistant.";

    // Retrieval: the user's pinned documents in full plus the excerpts that match
    // this question, scoped to their own files only.
    let systemPrompt = basePrompt;
    let sources: Source[] = [];
    try {
      const context = await buildContext(req.user!.id, userText);
      if (context.hasDocuments) {
        sources = context.sources;
        // The operator's prompt goes last, closest to the question. Placed first
        // it sits behind ~15KB of records and loses to them on style; placed
        // here it governs how the grounded answer is actually written.
        systemPrompt = [
          CONTEXT_INSTRUCTIONS,
          "--- USER HEALTH DOCUMENTS ---",
          context.contextBlock,
          "--- END OF USER HEALTH DOCUMENTS ---",
          basePrompt,
        ].join("\n\n");
      }
    } catch (err) {
      // A retrieval outage degrades the answer; it should not drop the message.
      createLogger(req.user!.id).error("[chat] retrieval failed", err);
    }

    const aiMessages: ChatMessage[] = await Promise.all(
      history.map(async (m) => {
        const msg: ChatMessage = { role: m.role, content: m.content };
        if (m.image_path) {
          try {
            const fullPath = path.join(uploadDir, m.image_path);
            const ext = path
              .extname(m.image_path)
              .toLowerCase()
              .replace(".", "");
            const mimeMap: Record<string, string> = {
              jpg: "image/jpeg",
              jpeg: "image/jpeg",
              png: "image/png",
              gif: "image/gif",
              webp: "image/webp",
            };
            msg.imageBase64 = fs.readFileSync(fullPath).toString("base64");
            msg.imageMimeType = mimeMap[ext] ?? "image/jpeg";
          } catch {
            /* skip unreadable images */
          }
        }
        return msg;
      }),
    );

    try {
      const aiChat = getAIProvider(modelProvider);
      const reply = await aiChat({ model, systemPrompt, messages: aiMessages });

      const [assistantMsg] = await knex("messages")
        .insert({
          conversation_id: conv.id,
          role: "assistant",
          content: reply,
          sources: sources.length > 0 ? JSON.stringify(sources) : null,
        })
        .returning("*");

      if (conv.title === "New conversation" && userText) {
        const title = userText.slice(0, 60);
        await knex("conversations")
          .where({ id: conv.id })
          .update({ title, updated_at: knex.fn.now() });
      } else {
        await knex("conversations")
          .where({ id: conv.id })
          .update({ updated_at: knex.fn.now() });
      }

      res.json(assistantMsg);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      createLogger(req.user!.id).error("[chat]", msg, err);
      res.status(502).json({ error: msg });
    }
  },
);

export default router;
