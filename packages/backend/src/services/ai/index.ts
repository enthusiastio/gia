import { claudeChat } from './claude';
import { openaiChat } from './openai';
import { geminiChat } from './gemini';
import { ChatProvider } from './types';

export function getAIProvider(provider?: string | null): ChatProvider {
  switch (provider ?? process.env.AI_PROVIDER ?? 'claude') {
    case 'openai': return openaiChat;
    case 'gemini': return geminiChat;
    default: return claudeChat;
  }
}

export { ChatMessage, ChatRequest } from './types';
