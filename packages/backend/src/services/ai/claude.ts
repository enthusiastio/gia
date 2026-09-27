import Anthropic from '@anthropic-ai/sdk';
import { ChatRequest, ChatProvider } from './types';

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  return client;
}

export const claudeChat: ChatProvider = async ({ model, systemPrompt, messages }) => {
  const formattedMessages = messages.map((m) => {
    if (m.role === 'user' && m.imageBase64 && m.imageMimeType) {
      return {
        role: 'user' as const,
        content: [
          {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: m.imageMimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
              data: m.imageBase64,
            },
          },
          { type: 'text' as const, text: m.content || 'What do you see in this image?' },
        ],
      };
    }
    return { role: m.role, content: m.content };
  });

  const response = await getClient().messages.create({
    model,
    max_tokens: 4096,
    system: systemPrompt,
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    messages: formattedMessages,
  });

  // Concatenate every text block: with web_search enabled the model routinely
  // emits several, and keeping only the last one discards the body of the
  // answer. Blocks are contiguous pieces of one message and carry their own
  // line breaks, so they are joined verbatim — inserting separators here
  // corrupts markdown tables that happen to span a block boundary.
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('')
    .trim();
};
