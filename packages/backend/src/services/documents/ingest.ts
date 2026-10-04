import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import knex from '../../db/knex';
import { getAIProvider } from '../ai';
import { resolveUserAIConfig } from '../settings';
import { createLogger, logger } from '../../logger';
import { chunkMarkdown, embeddableText } from './chunker';
import { embedTexts, toVectorLiteral } from './embeddings';
import { isPdf } from './fileTypes';
import { normaliseTags } from './tags';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';

const INSERT_BATCH_SIZE = 16;

/** Enough of the document for the model to characterise it, without paying for all of it. */
const DESCRIBE_CHAR_LIMIT = 12000;

async function extractText(storagePath: string, mimeType: string, originalName: string): Promise<string> {
  const fullPath = path.join(uploadDir, storagePath);

  if (isPdf(originalName, mimeType)) {
    const data = await pdfParse(fs.readFileSync(fullPath));
    return data.text;
  }
  const text = fs.readFileSync(fullPath, 'utf8');
  // A text extension does not guarantee text content; NULs mean binary.
  if (text.includes('\0')) throw new Error('File is not plain text');
  return text;
}

interface Described {
  title: string;
  description: string;
  tags: string[];
  documentDate: string | null;
}

/** Filename without extension, separators turned into spaces. */
function titleFromFilename(originalName: string): string {
  return path.parse(originalName).name.replace(/[_-]+/g, ' ').trim() || originalName;
}

/**
 * One pass over the head of the document to produce the title, summary and
 * tags shown in the admin panel and listed in every prompt's document manifest,
 * which is what the agent reads to decide where to look.
 */
async function describe(userId: string, originalName: string, text: string): Promise<Described> {
  const { model, provider } = await resolveUserAIConfig(userId);
  const chat = getAIProvider(provider);

  const reply = await chat({
    model,
    systemPrompt:
      'You catalogue personal health documents for a retrieval index. ' +
      'Respond with a single JSON object and nothing else: ' +
      '{"title": string, "description": string, "tags": string[], "document_date": string | null}. ' +
      'All in English. title: a short descriptive title of at most 8 words. ' +
      'description: two or three sentences stating concretely what the document contains: ' +
      'the measurements, genes, variants, markers, conditions or protocol elements covered, ' +
      'and the subject/sample identifier if present. Do not evaluate or interpret the findings. ' +
      'tags: 3 to 8 short lowercase topic tags someone might search for (e.g. "genetics", ' +
      '"blood test", "cardiovascular", "supplements"). document_date: the date the document ' +
      'itself reports (ISO 8601, YYYY-MM-DD), or null if it states none. ' +
      'Source documents may be in any language.',
    messages: [
      {
        role: 'user',
        content:
          `Filename: ${originalName}\n\n` +
          `--- DOCUMENT START ---\n${text.slice(0, DESCRIBE_CHAR_LIMIT)}\n--- DOCUMENT END ---`,
      },
    ],
  });

  try {
    const match = /\{[\s\S]*\}/.exec(reply);
    const parsed = JSON.parse(match ? match[0] : reply);
    const date = typeof parsed.document_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(parsed.document_date)
      ? parsed.document_date
      : null;
    return {
      title: String(parsed.title ?? '').trim().slice(0, 255) || titleFromFilename(originalName),
      description: String(parsed.description ?? '').trim() || 'No description.',
      tags: normaliseTags(parsed.tags),
      documentDate: date,
    };
  } catch {
    // A malformed summary must not sink the ingestion: chunks are the point.
    return { title: titleFromFilename(originalName), description: 'No description.', tags: [], documentDate: null };
  }
}

async function ingest(fileId: string): Promise<void> {
  const [file] = await knex('user_files').where({ id: fileId });
  if (!file) return;

  const log = createLogger(file.user_id);
  await knex('user_files').where({ id: fileId }).update({ status: 'processing', error: null });

  try {
    const text = await extractText(file.storage_path, file.mime_type, file.original_name);
    if (!text.trim()) throw new Error('Document contains no extractable text');

    const chunks = chunkMarkdown(text);
    if (chunks.length === 0) throw new Error('Document produced no chunks');

    // Admin edits win: only fields still empty are generated, so a re-index
    // never overwrites a title, summary or tag list someone corrected by hand.
    const existingTags = normaliseTags(file.tags);
    const needsDescribe = !file.title || !file.description || existingTags.length === 0;
    const generated = needsDescribe ? await describe(file.user_id, file.original_name, text) : null;
    const described = {
      title: file.title || generated!.title,
      description: file.description || generated!.description,
      tags: existingTags.length > 0 ? existingTags : generated!.tags,
      documentDate: file.document_date ?? generated?.documentDate ?? null,
    };

    const embeddings = await embedTexts(
      chunks.map((chunk) =>
        embeddableText(chunk, {
          title: described.title,
          description: described.description,
          tags: described.tags,
        })
      )
    );

    await knex.transaction(async (trx) => {
      await trx('file_chunks').where({ file_id: fileId }).delete();
      const rows = chunks.map((chunk, i) => ({
        id: uuidv4(),
        file_id: fileId,
        user_id: file.user_id,
        chunk_index: i,
        heading: chunk.heading,
        content: chunk.content,
        embedding: knex.raw('VEC_FromText(?)', [toVectorLiteral(embeddings[i])]),
      }));
      // Each embedding is ~60 KB as text; batches keep a long document's
      // insert well under the server's max_allowed_packet.
      for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        await trx('file_chunks').insert(rows.slice(i, i + INSERT_BATCH_SIZE));
      }
      await trx('user_files').where({ id: fileId }).update({
        status: 'ready',
        error: null,
        extracted_text: text,
        title: described.title,
        description: described.description,
        tags: described.tags.length > 0 ? JSON.stringify(described.tags) : null,
        document_date: described.documentDate,
        chunk_count: chunks.length,
        ingested_at: trx.fn.now(),
      });
    });

    log.info('[ingest] ready', file.original_name, `${chunks.length} chunks`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log.error('[ingest] failed', file.original_name, message);
    await knex('user_files').where({ id: fileId }).update({ status: 'failed', error: message });
  }
}

// Serial queue: embedding is network-bound and ingestion is rare, so one at a
// time keeps us clear of rate limits without any real latency cost.
let queue: Promise<void> = Promise.resolve();

export function enqueueIngestion(fileId: string): void {
  queue = queue.then(() => ingest(fileId)).catch((err) => {
    logger.error('[ingest] queue error', err);
  });
}

/** Re-queues anything left mid-flight by a restart. */
export async function resumePendingIngestions(): Promise<void> {
  const stuck = await knex('user_files')
    .whereIn('status', ['pending', 'processing'])
    .select('id');
  if (stuck.length === 0) return;
  logger.info(`[ingest] resuming ${stuck.length} pending document(s)`);
  stuck.forEach((f) => enqueueIngestion(f.id));
}
