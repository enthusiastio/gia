/** Which provider serves each model; saved alongside the model choice. */
export const MODEL_PROVIDERS: Record<string, string> = {
  'claude-fable-5': 'claude', 'claude-opus-4-8': 'claude', 'claude-sonnet-4-6': 'claude', 'claude-haiku-4-5': 'claude',
  'gpt-5.5': 'openai', 'gpt-5.4': 'openai', 'gpt-5.4-mini': 'openai', 'gpt-4o': 'openai',
  'gemini-3.5-flash': 'gemini', 'gemini-2.5-pro': 'gemini', 'gemini-2.5-flash': 'gemini',
};

interface ModelSelectProps {
  value: string;
  /** Called with the model and its provider; both empty for the default option. */
  onChange: (model: string, provider: string) => void;
  /** Label of the empty option, naming what "default" resolves to. */
  defaultLabel: string;
}

export function ModelSelect({ value, onChange, defaultLabel }: ModelSelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value, MODEL_PROVIDERS[e.target.value] ?? '')}
      className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50 transition-colors font-mono"
    >
      <option value="">{defaultLabel}</option>
      <optgroup label="Anthropic — Claude">
        <option value="claude-fable-5">claude-fable-5 — Most capable (flagship)</option>
        <option value="claude-opus-4-8">claude-opus-4-8 — Complex reasoning &amp; agentic</option>
        <option value="claude-sonnet-4-6">claude-sonnet-4-6 — Speed + intelligence balance</option>
        <option value="claude-haiku-4-5">claude-haiku-4-5 — Fastest, near-frontier</option>
      </optgroup>
      <optgroup label="OpenAI — GPT">
        <option value="gpt-5.5">gpt-5.5 — Latest flagship</option>
        <option value="gpt-5.4">gpt-5.4 — Coding &amp; professional</option>
        <option value="gpt-5.4-mini">gpt-5.4-mini — Strongest mini model</option>
        <option value="gpt-4o">gpt-4o — Widely available</option>
      </optgroup>
      <optgroup label="Google — Gemini">
        <option value="gemini-3.5-flash">gemini-3.5-flash — Most intelligent</option>
        <option value="gemini-2.5-pro">gemini-2.5-pro — Advanced complex tasks</option>
        <option value="gemini-2.5-flash">gemini-2.5-flash — Best price-performance</option>
      </optgroup>
    </select>
  );
}
