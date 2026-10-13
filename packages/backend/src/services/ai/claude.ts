import Anthropic from '@anthropic-ai/sdk';
import { getApiKey } from '../settings';
import { ChatProvider, emptyUsage, MAX_TOOL_ROUNDS } from './types';

// One client per key: a key saved under General replaces the old one at once.
let cached: { key: string; client: Anthropic } | null = null;
async function getClient(): Promise<Anthropic> {
  const key = await getApiKey('claude');
  if (!key) throw new Error('No Claude API key. Add one under Admin > General > Model selection.');
  if (cached?.key !== key) cached = { key, client: new Anthropic({ apiKey: key }) };
  return cached.client;
}

/**
 * A copy of the conversation with a cache breakpoint at its end. Each tool
 * round resends everything before it, and so does the user's next message;
 * with the breakpoint those reads come from the cache.
 */
function withCacheBreakpoint(conversation: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  const last = conversation[conversation.length - 1];
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === 'string' ? [{ type: 'text', text: last.content }] : [...last.content];
  const tail = blocks[blocks.length - 1];
  // Thinking blocks take no breakpoint and an empty text block is rejected
  // with one; such a call simply goes without.
  if (!tail || tail.type === 'thinking' || tail.type === 'redacted_thinking') return conversation;
  if (tail.type === 'text' && !tail.text.trim()) return conversation;
  blocks[blocks.length - 1] = { ...tail, cache_control: { type: 'ephemeral' } };
  return [...conversation.slice(0, -1), { ...last, content: blocks }];
}

export const claudeChat: ChatProvider = async ({ model, systemPrompt, messages, tools, runTool, oneOff }) => {
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
  const usage = emptyUsage();
  for (let round = 0; ; round++) {
    const forceAnswer = round >= MAX_TOOL_ROUNDS && customTools.length > 0;
    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      // Tools and system prompt are the same on every call for this user, so
      // they are cached: later calls read them at a tenth of the input price.
      system: oneOff ? systemPrompt : [{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }],
      tools: [{ type: 'web_search_20250305', name: 'web_search' }, ...customTools],
      ...(forceAnswer ? { tool_choice: { type: 'none' as const } } : {}),
      messages: oneOff ? conversation : withCacheBreakpoint(conversation),
    });
    usage.inputTokens += response.usage.input_tokens;
    usage.cacheReadTokens += response.usage.cache_read_input_tokens ?? 0;
    usage.cacheWriteTokens += response.usage.cache_creation_input_tokens ?? 0;
    usage.outputTokens += response.usage.output_tokens;
    usage.webSearches += response.usage.server_tool_use?.web_search_requests ?? 0;

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
      return { text: answer.trim(), usage };
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
