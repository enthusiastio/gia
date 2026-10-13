export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
}

/** A function the model may call, described once and translated per provider. */
export interface ToolSpec {
  name: string;
  description: string;
  /** JSON schema of the arguments object. */
  parameters: Record<string, unknown>;
}

/** Executes a tool call and returns the text handed back to the model. */
export type ToolRunner = (name: string, args: Record<string, unknown>) => Promise<string>;

export interface ChatRequest {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
  tools?: ToolSpec[];
  runTool?: ToolRunner;
  /**
   * A call nothing will follow up on. Providers that charge for writing to
   * their prompt cache skip it, since nothing would ever read it back.
   */
  oneOff?: boolean;
}

/** What one reply consumed, summed over every model call it took. */
export interface ChatUsage {
  /** Input billed at the full rate: cached input is counted below instead. */
  inputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  webSearches: number;
}

export const emptyUsage = (): ChatUsage => ({
  inputTokens: 0,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  webSearches: 0,
});

export interface ChatReply {
  text: string;
  usage: ChatUsage;
}

export type ChatProvider = (req: ChatRequest) => Promise<ChatReply>;

/**
 * Model calls allowed to end in tool use before the next one is forced to
 * answer. Each round is a full model call, so this also caps the cost of one
 * message.
 */
export const MAX_TOOL_ROUNDS = 5;
