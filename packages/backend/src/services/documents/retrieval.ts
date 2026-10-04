import knex from '../../db/knex';
import { embedQuery, toVectorLiteral } from './embeddings';

const TOP_K = parseInt(process.env.RETRIEVAL_TOP_K ?? '8', 10);
/**
 * Loose backstop, not a precision filter.
 *
 * Absolute cosine distance does not transfer between corpora: prose fixtures
 * put a correct match near 0.60, while dense clinical tables answering a
 * casual question sit at 0.86 and still rank first. A tuned-looking cutoff
 * therefore silently discards right answers on documents it was not tuned for,
 * which is exactly what a low value did here. Ranking picks the winners, the
 * relative gate below trims the tail, and CONTEXT_INSTRUCTIONS is what keeps
 * the model from presenting a weak match as an answer.
 */
const MAX_DISTANCE = parseFloat(process.env.RETRIEVAL_MAX_DISTANCE ?? '0.95');
const RELATIVE_MARGIN = parseFloat(process.env.RETRIEVAL_RELATIVE_MARGIN ?? '0.05');

export interface Source {
  file_id: string;
  file_name: string;
  title: string;
  heading: string | null;
  /** pinned: always included in full; retrieved: a search hit; read: opened by the agent. */
  kind: 'pinned' | 'retrieved' | 'read';
}

export interface DocumentPrompt {
  prompt: string;
  sources: Source[];
  hasDocuments: boolean;
}

export interface ChunkRow {
  file_id: string;
  original_name: string;
  title: string | null;
  heading: string | null;
  content: string;
  distance: number;
}

/**
 * Similarity search over one user's chunks only, optionally narrowed to some
 * of their documents. The user_id predicate is the tenant boundary and is
 * never derived from client or model input.
 */
export async function searchChunks(userId: string, query: string, fileIds?: string[]): Promise<ChunkRow[]> {
  const embedding = toVectorLiteral(await embedQuery(query));
  const narrow = fileIds && fileIds.length > 0;

  const [rows] = await knex.raw(
    `SELECT c.file_id,
            f.original_name,
            f.title,
            c.heading,
            c.content,
            VEC_DISTANCE_COSINE(c.embedding, VEC_FromText(?)) AS distance
       FROM file_chunks c
       JOIN user_files f ON f.id = c.file_id
      WHERE c.user_id = ?
        AND f.status = 'ready'
        ${narrow ? 'AND c.file_id IN (?)' : ''}
      ORDER BY distance
      LIMIT ?`,
    narrow ? [embedding, userId, fileIds, TOP_K] : [embedding, userId, TOP_K]
  );

  const matches = (rows as ChunkRow[]).filter((r) => Number(r.distance) <= MAX_DISTANCE);
  if (matches.length === 0) return [];

  const best = Number(matches[0].distance);
  return matches.filter((r) => Number(r.distance) - best <= RELATIVE_MARGIN);
}

/** Large enough for most documents in one call, small enough not to flood the context. */
export const READ_WINDOW_CHARS = 20000;

export interface DocumentPage {
  file_id: string;
  original_name: string;
  title: string | null;
  text: string;
  offset: number;
  total: number;
  nextOffset: number | null;
}

/** One window of a ready document's extracted text, scoped to its owner. */
export async function readDocument(userId: string, fileId: string, offset = 0): Promise<DocumentPage | null> {
  const file = await knex('user_files')
    .where({ id: fileId, user_id: userId, status: 'ready' })
    .first('id', 'original_name', 'title', 'extracted_text');
  if (!file) return null;

  const full: string = file.extracted_text ?? '';
  const start = Math.max(0, Math.min(Math.floor(offset), full.length));
  const end = Math.min(full.length, start + READ_WINDOW_CHARS);
  return {
    file_id: file.id,
    original_name: file.original_name,
    title: file.title,
    text: full.slice(start, end),
    offset: start,
    total: full.length,
    nextOffset: end < full.length ? end : null,
  };
}

/**
 * The document part of the system prompt: a manifest of everything on file,
 * which is what the agent reads to decide where to search, plus the full
 * text of the documents the admin marked "always include".
 */
export async function buildDocumentPrompt(userId: string): Promise<DocumentPrompt> {
  const files = await knex('user_files')
    .where({ user_id: userId, status: 'ready' })
    .orderBy('created_at', 'asc')
    .select(
      'id',
      'original_name',
      'title',
      'description',
      'tags',
      'document_date',
      'always_include',
      knex.raw('CHAR_LENGTH(extracted_text) AS text_length')
    );

  if (files.length === 0) {
    return { prompt: '', sources: [], hasDocuments: false };
  }

  const manifest = files
    .map((f) => {
      const details = [
        f.original_name,
        f.document_date ? `dated ${String(f.document_date).slice(0, 10)}` : null,
        `${Number(f.text_length ?? 0).toLocaleString('en')} chars`,
        f.always_include ? 'included in full below' : null,
      ].filter(Boolean);
      const tags = Array.isArray(f.tags) && f.tags.length > 0 ? `\n  Tags: ${f.tags.join(', ')}` : '';
      return (
        `- id: ${f.id}\n  Title: ${f.title ?? f.original_name} (${details.join(', ')})` +
        `${tags}\n  Summary: ${f.description ?? 'No description.'}`
      );
    })
    .join('\n');

  const parts = [CONTEXT_INSTRUCTIONS, TOOL_INSTRUCTIONS, `The user's health documents on file:\n${manifest}`];
  const sources: Source[] = [];

  const includedIds = files.filter((f) => f.always_include).map((f) => f.id);
  if (includedIds.length > 0) {
    const included = await knex('user_files')
      .whereIn('id', includedIds)
      .orderBy('created_at', 'asc')
      .select('id', 'original_name', 'title', 'extracted_text');
    for (const file of included) {
      if (!file.extracted_text?.trim()) continue;
      const title = file.title ?? file.original_name;
      parts.push(`[Document: ${title} | id: ${file.id}]\n${file.extracted_text.trim()}`);
      sources.push({ file_id: file.id, file_name: file.original_name, title, heading: null, kind: 'pinned' });
    }
  }

  return { prompt: parts.join('\n\n'), sources, hasDocuments: true };
}

/**
 * Grounding rules only — deliberately no directions about length, tone or
 * citation format. Those belong to the operator's own system prompt, which is
 * appended after the documents; anything stylistic here competes with it.
 * Source attribution reaches the user through the `sources` chips in the UI,
 * so the model is not asked to name documents inline.
 */
export const CONTEXT_INSTRUCTIONS = `
The documents listed below are this user's own health records, and the only source of
personal data about them. Base every personalised statement on those records.
Never infer or invent a genotype, biomarker value, phenotype state or protocol
step that does not appear in them.

If the records do not cover what was asked, say so before answering, and make
clear which part of your answer is general knowledge rather than a finding
about this user.

The records may be written in any language; reply in the language the user
writes in.
`.trim();

export const TOOL_INSTRUCTIONS = `
You have two tools for these records. search_documents finds the most relevant
excerpts across the user's documents, or within the ones whose ids you pass.
read_document returns a document's full text, page by page. Before answering
anything about the user's own health, check the records: search first, and
read a document when you need a whole section or table rather than excerpts.
Documents marked "included in full below" are already here; do not fetch them.
`.trim();
