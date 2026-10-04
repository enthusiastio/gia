import { ModelOption, ProviderId } from '@/lib/api';

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  openai: 'OpenAI — GPT',
  claude: 'Anthropic — Claude',
  gemini: 'Google — Gemini',
};

interface ModelSelectProps {
  value: string;
  /** The catalogue from General; only models ticked there are offered. */
  models: ModelOption[];
  /** Called with the model and its provider; both empty for the default option. */
  onChange: (model: string, provider: string) => void;
  /** Label of the empty option, naming what "default" resolves to. */
  defaultLabel: string;
}

export function ModelSelect({ value, models, onChange, defaultLabel }: ModelSelectProps) {
  const current = models.find((m) => m.id === value);
  // Hiding a model must not change anyone's choice, so the current one is
  // always listed, even when it is no longer offered.
  const keepCurrent = value && (!current || !current.enabled);
  const groups = (Object.keys(PROVIDER_LABELS) as ProviderId[])
    .map((provider) => ({ provider, options: models.filter((m) => m.provider === provider && m.enabled) }))
    .filter((g) => g.options.length > 0);

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value, models.find((m) => m.id === e.target.value)?.provider ?? '')}
      className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50 transition-colors font-mono"
    >
      <option value="">{defaultLabel}</option>
      {keepCurrent && (
        <option value={value}>
          {value} — hidden under General
        </option>
      )}
      {groups.map(({ provider, options }) => (
        <optgroup key={provider} label={PROVIDER_LABELS[provider]}>
          {options.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id} — {m.label}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
