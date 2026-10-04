import { FunctionDeclarationSchema, FunctionResponsePart, GoogleGenerativeAI, Part, Tool } from '@google/generative-ai';
import { ChatProvider, MAX_TOOL_ROUNDS } from './types';

const client = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

export const geminiChat: ChatProvider = async ({ model, systemPrompt, messages, tools, runTool }) => {
  // Gemini will not combine Google Search with function calling in one
  // request, so the user's documents take precedence over web search.
  const geminiTools: Tool[] =
    tools && tools.length > 0
      ? [{
          functionDeclarations: tools.map((t) => ({
            name: t.name,
            description: t.description,
            parameters: t.parameters as unknown as FunctionDeclarationSchema,
          })),
        }]
      : [{ googleSearchRetrieval: {} }];

  const genModel = client.getGenerativeModel({
    model,
    systemInstruction: systemPrompt,
    tools: geminiTools,
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
  let result = await chat.sendMessage(parts);

  for (let round = 1; ; round++) {
    const calls = result.response.functionCalls();
    if (!calls || calls.length === 0 || !runTool) return result.response.text();

    // Tool choice is fixed per chat session here, so the last round answers
    // the calls with a request to stop instead of running them.
    const exhausted = round > MAX_TOOL_ROUNDS;
    const responses: FunctionResponsePart[] = [];
    for (const call of calls) {
      const output = exhausted
        ? 'Tool budget for this answer is used up. Answer now with what you already have.'
        : await runTool(call.name, (call.args ?? {}) as Record<string, unknown>);
      responses.push({ functionResponse: { name: call.name, response: { result: output } } });
    }
    result = await chat.sendMessage(responses);
    if (exhausted) return result.response.text();
  }
};
