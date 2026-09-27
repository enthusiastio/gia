export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  imageBase64?: string;
  imageMimeType?: string;
}

export interface ChatRequest {
  model: string;
  systemPrompt: string;
  messages: ChatMessage[];
}

export type ChatProvider = (req: ChatRequest) => Promise<string>;
