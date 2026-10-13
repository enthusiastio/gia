export type ProviderId = 'openai' | 'claude' | 'gemini';

export const PROVIDERS: ProviderId[] = ['openai', 'claude', 'gemini'];

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
  /** USD per million tokens, from the provider's price list. */
  inputPrice: number;
  /** Input the provider served from its prompt cache. */
  cachedInputPrice: number;
  outputPrice: number;
}

/** Every model the app can run. Admins choose which of them the dropdowns offer. */
export const MODEL_CATALOG: ModelInfo[] = [
  { id: 'gpt-5.5', provider: 'openai', label: 'Latest flagship', inputPrice: 5, cachedInputPrice: 0.5, outputPrice: 30 },
  { id: 'gpt-5.4', provider: 'openai', label: 'Coding & professional', inputPrice: 2.5, cachedInputPrice: 0.25, outputPrice: 15 },
  { id: 'gpt-5.4-mini', provider: 'openai', label: 'Strongest mini model', inputPrice: 0.75, cachedInputPrice: 0.075, outputPrice: 4.5 },
  { id: 'gpt-4o', provider: 'openai', label: 'Widely available', inputPrice: 2.5, cachedInputPrice: 1.25, outputPrice: 10 },
  { id: 'claude-fable-5', provider: 'claude', label: 'Most capable (flagship)', inputPrice: 10, cachedInputPrice: 1, outputPrice: 50 },
  { id: 'claude-opus-4-8', provider: 'claude', label: 'Complex reasoning & agentic', inputPrice: 5, cachedInputPrice: 0.5, outputPrice: 25 },
  { id: 'claude-sonnet-4-6', provider: 'claude', label: 'Speed + intelligence balance', inputPrice: 3, cachedInputPrice: 0.3, outputPrice: 15 },
  { id: 'claude-haiku-4-5', provider: 'claude', label: 'Fastest, near-frontier', inputPrice: 1, cachedInputPrice: 0.1, outputPrice: 5 },
  { id: 'gemini-3.5-flash', provider: 'gemini', label: 'Most intelligent', inputPrice: 0.75, cachedInputPrice: 0.075, outputPrice: 3.75 },
  { id: 'gemini-2.5-pro', provider: 'gemini', label: 'Advanced complex tasks', inputPrice: 1.25, cachedInputPrice: 0.125, outputPrice: 10 },
  { id: 'gemini-2.5-flash', provider: 'gemini', label: 'Best price-performance', inputPrice: 0.3, cachedInputPrice: 0.03, outputPrice: 2.5 },
];

/**
 * What writing input into the prompt cache costs, as a multiple of the input
 * price. Only Claude charges for the write (5-minute cache); the others cache
 * on their own and report reads alone.
 */
export const CACHE_WRITE_MULTIPLIER = 1.25;

/** USD per 1,000 web searches the provider runs for the model, billed on top of tokens. */
export const WEB_SEARCH_PRICE: Record<ProviderId, number> = {
  openai: 10,
  claude: 10,
  gemini: 35,
};

/** The .env variable each provider's key falls back to. */
export const ENV_KEY_NAMES: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GOOGLE_AI_API_KEY',
};

export function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as string[]).includes(value);
}
