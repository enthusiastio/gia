import fs from 'fs';
import path from 'path';
import knex from '../../db/knex';
import { getAIProvider } from '../ai';
import { createLogger, logger } from '../../logger';
import { categoryLabel } from './categories';
import { chunkMarkdown, embeddableText } from './chunker';
import { embedTexts, toVectorLiteral } from './embeddings';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse: (buf: Buffer) => Promise<{ text: string }> = require('pdf-parse');

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';

/** Enough of the document for the model to characterise it, without paying for all of it. */
const DESCRIBE_CHAR_LIMIT = 12000;

async function extractText(storagePath: string, mimeType: string, originalName: string): Promise<string> {
  const fullPath = path.join(uploadDir, storagePath);
  const ext = path.extname(originalName).toLowerCase();

  if (mimeType === 'application/pdf' || ext === '.pdf') {
    const data = await pdfParse(fs.readFileSync(fullPath));
    return data.text;
  }
  return fs.readFileSync(fullPath, 'utf8');
}

interface Described {
  description: string;
  documentDate: string | null;
}

/**
 * One pass over the head of the document to produce the description shown in
 * the admin panel and injected into every prompt as part of the file manifest.
 */
async function describe(
  userId: string,
  category: string,
  originalName: string,
  text: string
): Promise<Described> {
  const [config] = await knex('user_configs').where({ user_id: userId });
  const model = config?.model || process.env.DEFAULT_MODEL || 'claude-opus-4-8';
  const chat = getAIProvider(config?.model_provider ?? null);

  const reply = await chat({
    model,
    systemPrompt:
      'You summarise personal health documents for a retrieval index. ' +
      'Respond with a single JSON object and nothing else: ' +
      '{"description": string, "document_date": string | null}. ' +
      'The description is one or two sentences, in English, stating concretely what the ' +
      'document contains: the measurements, genes, variants, markers, axes or protocol ' +
      'elements covered, and the subject/sample identifier if present. Do not evaluate ' +
      'or interpret the findings. document_date is the date the document itself reports ' +
      '(ISO 8601, YYYY-MM-DD), or null if it states none. Source documents may be in any language.',
    messages: [
      {
        role: 'user',
        content:
          `Category: ${categoryLabel(category)}\nFilename: ${originalName}\n\n` +
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
      description: String(parsed.description ?? '').trim() || `${categoryLabel(category)} document.`,
      documentDate: date,
    };
  } catch {
    // A malformed summary must not sink the ingestion: chunks are the point.
    return { description: `${categoryLabel(category)} document.`, documentDate: null };
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

    const described = file.description
      ? { description: file.description, documentDate: file.document_date ?? null }
      : await describe(file.user_id, file.category, file.original_name, text);

    const embeddings = await embedTexts(
      chunks.map((chunk) =>
        embeddableText(chunk, {
          categoryLabel: categoryLabel(file.category),
          description: described.description,
        })
      )
    );

    await knex.transaction(async (trx) => {
      await trx('file_chunks').where({ file_id: fileId }).delete();
      await trx('file_chunks').insert(
        chunks.map((chunk, i) => ({
          file_id: fileId,
          user_id: file.user_id,
          category: file.category,
          chunk_index: i,
          heading: chunk.heading,
          content: chunk.content,
          embedding: knex.raw('?::vector', [toVectorLiteral(embeddings[i])]),
        }))
      );
      await trx('user_files').where({ id: fileId }).update({
        status: 'ready',
        error: null,
        extracted_text: text,
        description: described.description,
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
