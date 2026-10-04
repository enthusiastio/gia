import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from '../settings';
import { ChatProvider, MAX_TOOL_ROUNDS } from './types';

// One client per key: a key saved under General replaces the old one at once.
let cached: { key: string; client: Anthropic } | null = null;
async function getClient(): Promise<Anthropic> {
  const key = await getApiKey('claude');
  if (!key) throw new Error('No Claude API key. Add one under Admin > General > Model selection.');
  if (cached?.key !== key) cached = { key, client: new Anthropic({ apiKey: key }) };
  return cached.client;
}

export const claudeChat: ChatProvider = async ({ model, systemPrompt, messages, tools, runTool }) => {
  const formattedMessages: Anthropic.MessageParam[] = messages.map((m) => {
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

  const client = await getClient();
  const customTools: Anthropic.Tool[] = (tools ?? []).map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.parameters as Anthropic.Tool.InputSchema,
  }));
  const conversation: Anthropic.MessageParam[] = formattedMessages;

  // Text since the last tool round. Anything said before a tool call is
  // preamble ("let me check your records"), not part of the answer.
  let answer = '';
  for (let round = 0; ; round++) {
    const forceAnswer = round >= MAX_TOOL_ROUNDS && customTools.length > 0;
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }, ...customTools],
      ...(forceAnswer ? { tool_choice: { type: 'none' as const } } : {}),
      messages: conversation,
    });

    // Concatenate every text block: with web_search enabled the model routinely
    // emits several, and keeping only the last one discards the body of the
    // answer. Blocks are contiguous pieces of one message and carry their own
    // line breaks, so they are joined verbatim — inserting separators here
    // corrupts markdown tables that happen to span a block boundary.
    answer += response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');

    if (response.stop_reason === 'pause_turn') {
      // A long server-side web search paused; resending lets it continue.
      conversation.push({ role: 'assistant', content: response.content });
      continue;
    }

    const calls = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    if (response.stop_reason !== 'tool_use' || calls.length === 0 || !runTool) {
      return answer.trim();
    }

    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const call of calls) {
      results.push({
        type: 'tool_result',
        tool_use_id: call.id,
        content: await runTool(call.name, (call.input ?? {}) as Record<string, unknown>),
      });
    }
    conversation.push({ role: 'assistant', content: response.content });
    conversation.push({ role: 'user', content: results });
    answer = '';
  }
};
