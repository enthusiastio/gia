import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

process.on("uncaughtException", (err) => {
  process.stderr.write(`[FATAL] uncaughtException: ${err.stack ?? err.message}\n`);
  process.exit(1);
});
process.on("unhandledRejection", (reason) => {
  process.stderr.write(`[FATAL] unhandledRejection: ${reason}\n`);
  process.exit(1);
});

process.stdout.write("[BOOT] dotenv loaded\n");
process.stdout.write(`[BOOT] GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? "SET" : "MISSING"}\n`);
process.stdout.write(`[BOOT] DATABASE_URL: ${process.env.DATABASE_URL ? "SET" : "MISSING"}\n`);
process.stdout.write(`[BOOT] JWT_SECRET: ${process.env.JWT_SECRET ? "SET" : "MISSING"}\n`);
process.stdout.write(`[BOOT] ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? "SET" : "MISSING"}\n`);
process.stdout.write(`[BOOT] PORT: ${process.env.PORT}\n`);

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import passport from "passport";
import fs from "fs";

async function main() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const knex = require("./db/knex").default;

  process.stdout.write("[BOOT] running migrations...\n");
  await knex.migrate.latest();
  process.stdout.write("[BOOT] migrations complete\n");

  process.stdout.write("[BOOT] loading authRouter...\n");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const authRouter = require("./routes/auth").default;
  process.stdout.write("[BOOT] loading chatRouter...\n");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const chatRouter = require("./routes/chat").default;
  process.stdout.write("[BOOT] loading filesRouter...\n");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const filesRouter = require("./routes/files").default;
  process.stdout.write("[BOOT] loading adminRouter...\n");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const adminRouter = require("./routes/admin").default;
  process.stdout.write("[BOOT] all routes loaded\n");

  // Re-queue any document left mid-ingestion by a previous shutdown.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("./services/documents/ingest")
    .resumePendingIngestions()
    .catch((err: unknown) => process.stderr.write(`[BOOT] resume ingestions failed: ${err}\n`));

  const app = express();
  const PORT = parseInt(process.env.PORT ?? "3001", 10);
  const uploadDir = process.env.UPLOAD_DIR ?? "./uploads";

  ["images", "genetic"].forEach((sub) => {
    fs.mkdirSync(path.join(uploadDir, sub), { recursive: true });
  });

  app.use(cors({ origin: process.env.FRONTEND_URL, credentials: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(passport.initialize());

  app.use("/api/auth", authRouter);
  app.use("/api/chat", chatRouter);
  app.use("/api/files", filesRouter);
  app.use("/api/admin", adminRouter);
  app.use("/api/uploads", express.static(uploadDir));

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.listen(PORT, () =>
    process.stdout.write(`[BOOT] Backend running on http://localhost:${PORT}\n`),
  );
}

main();
