import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Save } from 'lucide-react';
import { api, GeneralSettings } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ModelSelect } from './ModelSelect';
import { ModelSelectionPanel } from './ModelSelectionPanel';

interface GeneralPanelProps {
  settings: GeneralSettings;
  onSaved: (settings: GeneralSettings) => void;
}

/** The prompt every user runs on, and the model for those without their own. */
export function GeneralPanel({ settings, onSaved }: GeneralPanelProps) {
  const [model, setModel] = useState(settings.default_model ?? '');
  const [provider, setProvider] = useState(settings.default_model_provider ?? '');
  const [prompt, setPrompt] = useState(settings.default_system_prompt ?? '');
  const [dailyLimit, setDailyLimit] = useState(settings.daily_limit_usd ?? '');
  const [monthlyLimit, setMonthlyLimit] = useState(settings.monthly_limit_usd ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Only when the saved defaults change: saving a key or ticking a model also
  // replaces `settings`, and must not wipe an unsaved prompt.
  useEffect(() => {
    setModel(settings.default_model ?? '');
    setProvider(settings.default_model_provider ?? '');
    setPrompt(settings.default_system_prompt ?? '');
    setDailyLimit(settings.daily_limit_usd ?? '');
    setMonthlyLimit(settings.monthly_limit_usd ?? '');
  }, [
    settings.default_model,
    settings.default_model_provider,
    settings.default_system_prompt,
    settings.daily_limit_usd,
    settings.monthly_limit_usd,
  ]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await api.admin.saveSettings({
        default_model: model,
        default_model_provider: provider,
        default_system_prompt: prompt,
        daily_limit_usd: dailyLimit,
        monthly_limit_usd: monthlyLimit,
      });
      onSaved(next);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="space-y-4">
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-1">General</h2>
        <p className="text-xs text-text-dim mb-4 leading-relaxed">
          The system prompt applies to every user. A model set on a user's own page takes the default model's place.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">Default AI model</label>
            <ModelSelect
              value={model}
              models={settings.models}
              onChange={(m, p) => { setModel(m); setProvider(p); }}
              defaultLabel={`Server default (${settings.server_default_model})`}
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">Default system prompt</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="You are a personalized genetic health assistant..."
              rows={10}
              className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-dim outline-none focus:border-primary/50 transition-colors resize-y leading-relaxed"
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">Usage limit per user (USD of model cost)</label>
            <div className="grid grid-cols-2 gap-3">
              {([
                ['Per day', dailyLimit, setDailyLimit, settings.default_daily_limit_usd],
                ['Per month', monthlyLimit, setMonthlyLimit, settings.default_monthly_limit_usd],
              ] as const).map(([label, value, setValue, fallback]) => (
                <label key={label} className="block">
                  <span className="block text-[11px] text-text-dim mb-1">{label}</span>
                  <input
                    type="number"
                    min="0"
                    step="0.5"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder={String(fallback)}
                    className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-dim outline-none focus:border-primary/50 transition-colors"
                  />
                </label>
              ))}
            </div>
            <p className="text-[11px] text-text-dim mt-1.5 leading-relaxed">
              Chat stops answering a user who reaches either limit until it resets: daily at midnight UTC, monthly on the first. Users see how much is left as a percentage, never the amounts.
            </p>
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          <Button onClick={save} disabled={saving} size="sm">
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save defaults'}
          </Button>
        </div>
      </div>

      <ModelSelectionPanel settings={settings} onSaved={onSaved} />
    </motion.div>
  );
}
