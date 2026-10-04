import { ToolSpec } from '../ai/types';
import { readDocument, searchChunks, Source } from './retrieval';

const SPECS: ToolSpec[] = [
  {
    name: 'search_documents',
    description:
      "Semantic search over the user's own health documents. Returns the best-matching " +
      'excerpts with their document title, id and section. Phrase the query as the ' +
      'information you need, e.g. "vitamin D level" or "MTHFR variant".',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'What to look for.' },
        document_ids: {
          type: 'array',
          items: { type: 'string' },
          description: 'Optional: only search these document ids from the manifest.',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'read_document',
    description:
      "Returns the full text of one of the user's documents, in pages. Use it when " +
      'excerpts are not enough, e.g. to see a whole table or section.',
    parameters: {
      type: 'object',
      properties: {
        document_id: { type: 'string', description: 'Document id from the manifest.' },
        offset: {
          type: 'number',
          description: 'Character offset to continue from, as given at the end of the previous page.',
        },
      },
      required: ['document_id'],
    },
  },
];

export interface DocumentTools {
  specs: ToolSpec[];
  run: (name: string, args: Record<string, unknown>) => Promise<string>;
  /** Every document the agent drew on, in first-use order. */
  sources: Source[];
  callCount: () => number;
}

/**
 * Tools bound to one user. The user id lives in this closure and is never
 * read from the model's arguments, so a hallucinated or injected document id
 * can only ever miss: the tenant boundary is the same as plain retrieval's.
 */
export function createDocumentTools(userId: string): DocumentTools {
  const sources: Source[] = [];
  const seen = new Set<string>();
  let calls = 0;

  const record = (source: Source) => {
    const key = `${source.kind}:${source.file_id}:${source.heading ?? ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    sources.push(source);
  };

  async function search(args: Record<string, unknown>): Promise<string> {
    const query = typeof args.query === 'string' ? args.query.trim() : '';
    if (!query) return 'Error: "query" is required.';
    const ids = Array.isArray(args.document_ids)
      ? args.document_ids.filter((id): id is string => typeof id === 'string')
      : undefined;

    const matches = await searchChunks(userId, query, ids);
    if (matches.length === 0) return 'No matching excerpts found.';

    return matches
      .map((m, i) => {
        const title = m.title ?? m.original_name;
        record({ file_id: m.file_id, file_name: m.original_name, title, heading: m.heading, kind: 'retrieved' });
        const section = m.heading ? ` | Section: ${m.heading}` : '';
        return `[${i + 1}] Document: ${title} | id: ${m.file_id}${section}\n${m.content}`;
      })
      .join('\n\n');
  }

  async function read(args: Record<string, unknown>): Promise<string> {
    const id = typeof args.document_id === 'string' ? args.document_id : '';
    if (!id) return 'Error: "document_id" is required.';
    const offset = typeof args.offset === 'number' && Number.isFinite(args.offset) ? args.offset : 0;

    const page = await readDocument(userId, id, offset);
    if (!page) return `Document ${id} not found.`;

    const title = page.title ?? page.original_name;
    record({ file_id: page.file_id, file_name: page.original_name, title, heading: null, kind: 'read' });
    const end = page.offset + page.text.length;
    const more = page.nextOffset !== null
      ? `\n\n[Characters ${page.offset}-${end} of ${page.total}. Call read_document with offset ${page.nextOffset} for more.]`
      : `\n\n[End of document. Characters ${page.offset}-${end} of ${page.total}.]`;
    return `Document: ${title} | id: ${page.file_id}\n\n${page.text}${more}`;
  }

  return {
    specs: SPECS,
    sources,
    callCount: () => calls,
    async run(name, args) {
      calls += 1;
      try {
        if (name === 'search_documents') return await search(args);
        if (name === 'read_document') return await read(args);
        return `Error: unknown tool "${name}".`;
      } catch (err) {
        // Reported to the model rather than thrown, so one failed lookup
        // (e.g. the embeddings API being down) does not lose the whole answer.
        return `Error: ${err instanceof Error ? err.message : String(err)}`;
      }
    },
  };
}
