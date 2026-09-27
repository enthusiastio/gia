import OpenAI from 'openai';

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-large';
export const EMBEDDING_DIMENSIONS = parseInt(process.env.EMBEDDING_DIMENSIONS ?? '3072', 10);

/** OpenAI accepts far more per call, but batches this size keep payloads sane. */
const BATCH_SIZE = 64;
const MAX_RETRIES = 3;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is required for document embeddings');
  }
  client ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

async function embedBatch(inputs: string[]): Promise<number[][]> {
  let lastError: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await getClient().embeddings.create({
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
        input: inputs,
      });
      return res.data.map((d) => d.embedding);
    } catch (err) {
      lastError = err;
      // Rate limits and transient 5xx are worth a backoff; bad input is not,
      // but a few wasted seconds beats failing an entire ingestion run.
      await new Promise((r) => setTimeout(r, 2 ** attempt * 1000));
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  const out: number[][] = [];
  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    out.push(...(await embedBatch(texts.slice(i, i + BATCH_SIZE))));
  }
  return out;
}

export async function embedQuery(text: string): Promise<number[]> {
  const [embedding] = await embedBatch([text]);
  return embedding;
}

/** pgvector's text input format. */
export function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(',')}]`;
}
