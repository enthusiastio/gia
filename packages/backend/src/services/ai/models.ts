export type ProviderId = 'openai' | 'claude' | 'gemini';

export const PROVIDERS: ProviderId[] = ['openai', 'claude', 'gemini'];

export interface ModelInfo {
  id: string;
  provider: ProviderId;
  label: string;
}

/** Every model the app can run. Admins choose which of them the dropdowns offer. */
export const MODEL_CATALOG: ModelInfo[] = [
  { id: 'gpt-5.5', provider: 'openai', label: 'Latest flagship' },
  { id: 'gpt-5.4', provider: 'openai', label: 'Coding & professional' },
  { id: 'gpt-5.4-mini', provider: 'openai', label: 'Strongest mini model' },
  { id: 'gpt-4o', provider: 'openai', label: 'Widely available' },
  { id: 'claude-fable-5', provider: 'claude', label: 'Most capable (flagship)' },
  { id: 'claude-opus-4-8', provider: 'claude', label: 'Complex reasoning & agentic' },
  { id: 'claude-sonnet-4-6', provider: 'claude', label: 'Speed + intelligence balance' },
  { id: 'claude-haiku-4-5', provider: 'claude', label: 'Fastest, near-frontier' },
  { id: 'gemini-3.5-flash', provider: 'gemini', label: 'Most intelligent' },
  { id: 'gemini-2.5-pro', provider: 'gemini', label: 'Advanced complex tasks' },
  { id: 'gemini-2.5-flash', provider: 'gemini', label: 'Best price-performance' },
];

/** The .env variable each provider's key falls back to. */
export const ENV_KEY_NAMES: Record<ProviderId, string> = {
  openai: 'OPENAI_API_KEY',
  claude: 'ANTHROPIC_API_KEY',
  gemini: 'GOOGLE_AI_API_KEY',
};

export function isProvider(value: unknown): value is ProviderId {
  return typeof value === 'string' && (PROVIDERS as string[]).includes(value);
}
