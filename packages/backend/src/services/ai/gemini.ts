import { GoogleGenerativeAI, Part } from '@google/generative-ai';
import { ChatProvider } from './types';

const client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export const geminiChat: ChatProvider = async ({ model, systemPrompt, messages }) => {
  const genModel = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    tools: [{ googleSearchRetrieval: {} }],
  });

  const history = messages.slice(0, -1).map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }] as Part[],
  }));

  const last = messages[messages.length - 1];
  const parts: Part[] = [];

  if (last.imageBase64 && last.imageMimeType) {
    parts.push({
      inlineData: {
        mimeType: last.imageMimeType,
        data: last.imageBase64,
      },
    });
  }
  parts.push({ text: last.content || 'What do you see in this image?' });

  const chat = genModel.startChat({ history });
  const result = await chat.sendMessage(parts);
  return result.response.text();
};
