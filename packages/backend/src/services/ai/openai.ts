import OpenAI from 'openai';
import { getApiKey } from '../settings';
import { ChatProvider, MAX_TOOL_ROUNDS } from './types';

// One client per key: a key saved under General replaces the old one at once.
let cached: { key: string; client: OpenAI } | null = null;
export async function getOpenAIClient(): Promise<OpenAI> {
  const key = await getApiKey('openai');
  if (!key) throw new Error('No OpenAI API key. Add one under Admin > General > Model selection.');
  if (cached?.key !== key) cached = { key, client: new OpenAI({ apiKey: key }) };
  return cached.client;
}

export const openaiChat: ChatProvider = async ({ model, systemPrompt, messages, tools, runTool }) => {
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

  const client = await getOpenAIClient();
  const functionTools: OpenAI.Responses.FunctionTool[] = (tools ?? []).map((t) => ({
    type: 'function',
    name: t.name,
    description: t.description,
    parameters: t.parameters,
    // Strict mode demands every property be required; ours has optional ones.
    strict: false,
  }));

  let response = await client.responses.create({
    model,
    instructions: systemPrompt,
    tools: [{ type: 'web_search_preview' }, ...functionTools],
    input,
  });

  for (let round = 1; ; round++) {
    const calls = response.output.filter(
      (o): o is OpenAI.Responses.ResponseFunctionToolCall => o.type === 'function_call'
    );
    if (calls.length === 0 || !runTool) return response.output_text;

    const outputs: OpenAI.Responses.ResponseInputItem[] = [];
    for (const call of calls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.arguments || '{}');
      } catch {
        /* malformed arguments: the tool reports what is missing */
      }
      outputs.push({ type: 'function_call_output', call_id: call.call_id, output: await runTool(call.name, args) });
    }

    // previous_response_id carries the conversation server-side, but not the
    // instructions, so those are sent again every round.
    response = await client.responses.create({
      model,
      instructions: systemPrompt,
      tools: [{ type: 'web_search_preview' }, ...functionTools],
      ...(round >= MAX_TOOL_ROUNDS ? { tool_choice: 'none' as const } : {}),
      previous_response_id: response.id,
      input: outputs,
    });
  }
};
