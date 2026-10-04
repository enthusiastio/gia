import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Save } from 'lucide-react';
import { api, GeneralSettings } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { ModelSelect } from './ModelSelect';

interface GeneralPanelProps {
  settings: GeneralSettings;
  onSaved: (settings: GeneralSettings) => void;
}

/** Defaults for every user who has no model or prompt of their own. */
export function GeneralPanel({ settings, onSaved }: GeneralPanelProps) {
  const [model, setModel] = useState(settings.default_model ?? '');
  const [provider, setProvider] = useState(settings.default_model_provider ?? '');
  const [prompt, setPrompt] = useState(settings.default_system_prompt ?? '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setModel(settings.default_model ?? '');
    setProvider(settings.default_model_provider ?? '');
    setPrompt(settings.default_system_prompt ?? '');
  }, [settings]);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await api.admin.saveSettings({
        default_model: model,
        default_model_provider: provider,
        default_system_prompt: prompt,
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
          Defaults for every user. A model or prompt set on a user's own page takes their place.
        </p>

        <div className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">Default AI model</label>
            <ModelSelect
              value={model}
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

          {error && <p className="text-xs text-red-400">{error}</p>}

          <Button onClick={save} disabled={saving} size="sm">
            {saved ? <Check size={14} /> : <Save size={14} />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save defaults'}
          </Button>
        </div>
      </div>
    </motion.div>
  );
}
