import knex from '../../db/knex';
import { logger } from '../../logger';
import { categoryLabel, PINNED_CATEGORIES, SEARCHABLE_CATEGORIES } from './categories';
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
  category: string;
  category_label: string;
  heading: string | null;
  kind: 'pinned' | 'retrieved';
}

export interface RetrievedContext {
  contextBlock: string;
  sources: Source[];
  hasDocuments: boolean;
}

interface ChunkRow {
  file_id: string;
  original_name: string;
  category: string;
  heading: string | null;
  content: string;
  distance: number;
}

/**
 * Similarity search over one user's chunks only. The user_id predicate is the
 * tenant boundary and is never derived from client input.
 */
async function searchChunks(userId: string, query: string): Promise<ChunkRow[]> {
  const embedding = toVectorLiteral(await embedQuery(query));

  const { rows } = await knex.raw(
    `SELECT c.file_id,
            f.original_name,
            c.category,
            c.heading,
            c.content,
            c.embedding <=> ?::vector AS distance
       FROM file_chunks c
       JOIN user_files f ON f.id = c.file_id
      WHERE c.user_id = ?
        AND c.category = ANY(?)
        AND f.status = 'ready'
      ORDER BY c.embedding <=> ?::vector
      LIMIT ?`,
    [embedding, userId, SEARCHABLE_CATEGORIES, embedding, TOP_K]
  );

  const matches = (rows as ChunkRow[]).filter((r) => Number(r.distance) <= MAX_DISTANCE);
  if (matches.length === 0) return [];

  const best = Number(matches[0].distance);
  return matches.filter((r) => Number(r.distance) - best <= RELATIVE_MARGIN);
}

export async function buildContext(userId: string, query: string): Promise<RetrievedContext> {
  const files = await knex('user_files')
    .where({ user_id: userId, status: 'ready' })
    .select('id', 'original_name', 'category', 'description', 'document_date', 'extracted_text');

  if (files.length === 0) {
    return { contextBlock: '', sources: [], hasDocuments: false };
  }

  const sources: Source[] = [];
  const parts: string[] = [];

  // Manifest first: the model should know what the user has on file even when
  // a document was not retrieved, so it can say what it could consult.
  parts.push(
    "The user's health documents on file:\n" +
      files
        .map((f) => {
          const date = f.document_date ? `, dated ${new Date(f.document_date).toISOString().slice(0, 10)}` : '';
          return `- ${categoryLabel(f.category)} — "${f.original_name}"${date}: ${f.description ?? 'No description.'}`;
        })
        .join('\n')
  );

  const pinned = files.filter((f) => PINNED_CATEGORIES.includes(f.category) && f.extracted_text?.trim());
  for (const file of pinned) {
    parts.push(
      `[Document: ${file.original_name} | Category: ${categoryLabel(file.category)}]\n${file.extracted_text.trim()}`
    );
    sources.push({
      file_id: file.id,
      file_name: file.original_name,
      category: file.category,
      category_label: categoryLabel(file.category),
      heading: null,
      kind: 'pinned',
    });
  }

  if (query.trim()) {
    // Similarity search is the only part needing the embeddings API. If it is
    // unavailable, the manifest and pinned documents above are still worth
    // sending, so the failure is contained here rather than losing all context.
    let matches: ChunkRow[] = [];
    try {
      matches = await searchChunks(userId, query);
    } catch (err) {
      logger.error('[retrieval] similarity search failed, continuing with pinned context', err);
    }
    for (const match of matches) {
      const location = match.heading ? ` | Section: ${match.heading}` : '';
      parts.push(
        `[Excerpt: ${match.original_name} | Category: ${categoryLabel(match.category)}${location}]\n${match.content}`
      );
      sources.push({
        file_id: match.file_id,
        file_name: match.original_name,
        category: match.category,
        category_label: categoryLabel(match.category),
        heading: match.heading,
        kind: 'retrieved',
      });
    }
  }

  return {
    contextBlock: parts.join('\n\n'),
    sources,
    hasDocuments: true,
  };
}

/**
 * Grounding rules only — deliberately no directions about length, tone or
 * citation format. Those belong to the operator's own system prompt, which is
 * appended after the documents; anything stylistic here competes with it.
 * Source attribution reaches the user through the `sources` chips in the UI,
 * so the model is not asked to name documents inline.
 */
export const CONTEXT_INSTRUCTIONS = `
The documents below are this user's own health records, and the only source of
personal data about them. Base every personalised statement on those records.
Never infer or invent a genotype, biomarker value, phenotype state or protocol
step that does not appear in them.

If the records do not cover what was asked, say so before answering, and make
clear which part of your answer is general knowledge rather than a finding
about this user.

The records may be written in any language; reply in the language the user
writes in.
`.trim();
