import OpenAI from 'openai';
import { ChatProvider } from './types';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export const openaiChat: ChatProvider = async ({ model, systemPrompt, messages }) => {
  const input: OpenAI.Responses.ResponseInputItem[] = messages.map((m) => {
    if (m.role === 'user' && m.imageBase64 && m.imageMimeType) {
      return {
        role: 'user' as const,
        content: [
          {
            type: 'input_image' as const,
            detail: 'auto' as const,
            image_url: `data:${m.imageMimeType};base64,${m.imageBase64}`,
          },
          { type: 'input_text' as const, text: m.content || 'What do you see in this image?' },
        ],
      };
    }
    return { role: m.role as 'user' | 'assistant', content: m.content };
  });

  const response = await client.responses.create({
    model,
    instructions: systemPrompt,
    tools: [{ type: 'web_search_preview' }],
    input,
  });

  return response.output_text;
};
