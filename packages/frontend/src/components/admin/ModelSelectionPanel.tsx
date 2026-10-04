import { useState } from 'react';
import { motion } from 'framer-motion';
import { KeyRound } from 'lucide-react';
import { api, GeneralSettings, ProviderId } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const TABS: { id: ProviderId; label: string }[] = [
  { id: 'openai', label: 'OpenAI' },
  { id: 'claude', label: 'Claude' },
  { id: 'gemini', label: 'Gemini' },
];

const MASK = '••••••••••••••••';

interface ModelSelectionPanelProps {
  settings: GeneralSettings;
  onSaved: (settings: GeneralSettings) => void;
}

/** Per-provider API keys and which models the dropdowns offer. */
export function ModelSelectionPanel({ settings, onSaved }: ModelSelectionPanelProps) {
  const [tab, setTab] = useState<ProviderId>('openai');
  const [draftKey, setDraftKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = settings.api_keys[tab];
  const models = settings.models.filter((m) => m.provider === tab);

  const run = async (fn: () => Promise<GeneralSettings>) => {
    setBusy(true);
    setError(null);
    try {
      onSaved(await fn());
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const switchTab = (next: ProviderId) => {
    setTab(next);
    setDraftKey('');
    setError(null);
  };

  const saveKey = async () => {
    if (await run(() => api.admin.saveApiKey(tab, draftKey))) setDraftKey('');
  };

  const toggleModel = (id: string, enabled: boolean) => {
    const next = settings.models.filter((m) => (m.id === id ? enabled : m.enabled)).map((m) => m.id);
    run(() => api.admin.saveEnabledModels(next));
  };

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <h2 className="text-sm font-semibold text-text-primary mb-1">Model selection</h2>
      <p className="text-xs text-text-dim mb-4 leading-relaxed">
        API keys and the models offered in the model menus. Hiding a model leaves users who already
        have it unchanged.
      </p>

      <div role="tablist" aria-label="AI providers" className="flex gap-1 p-1 bg-surface-2 rounded-xl mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => switchTab(t.id)}
            className={cn(
              'relative flex-1 px-3 py-1.5 text-sm rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary',
              tab === t.id ? 'text-text-primary' : 'text-text-muted hover:text-text-primary'
            )}
          >
            {tab === t.id && (
              <motion.span
                layoutId="provider-tab"
                className="absolute inset-0 rounded-lg bg-surface border border-border"
                transition={{ type: 'spring', stiffness: 500, damping: 40 }}
              />
            )}
            <span className="relative inline-flex items-center gap-1.5">
              {t.label}
              {settings.api_keys[t.id].source === 'none' && (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" title="No API key" />
              )}
            </span>
          </button>
        ))}
      </div>

      <div role="tabpanel" className="space-y-5">
        {/* API key: write-only. The server never sends a key back. */}
        <div>
          <label htmlFor={`api-key-${tab}`} className="flex items-center gap-1.5 text-xs text-text-muted mb-1.5">
            <KeyRound size={12} />
            API key
          </label>
          <div className="flex gap-2">
            <input
              id={`api-key-${tab}`}
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={draftKey}
              onChange={(e) => setDraftKey(e.target.value)}
              onCopy={(e) => e.preventDefault()}
              onCut={(e) => e.preventDefault()}
              placeholder={status.last4 ? `${MASK}${status.last4}` : 'Paste the API key'}
              className="flex-1 min-w-0 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-muted outline-none focus:border-primary/50 transition-colors font-mono"
            />
            <Button size="sm" onClick={saveKey} disabled={busy || !draftKey.trim()}>
              {status.source === 'saved' ? 'Replace key' : 'Save key'}
            </Button>
          </div>
          <p className="text-[11px] text-text-dim mt-1.5 leading-relaxed">
            {status.source === 'saved' && (
              <>
                Saved key ending in {status.last4}.{' '}
                <button
                  onClick={() => run(() => api.admin.removeApiKey(tab))}
                  disabled={busy}
                  className="text-text-muted underline hover:text-red-400 disabled:opacity-40"
                >
                  Remove it
                </button>{' '}
                to use the server's .env key instead.
              </>
            )}
            {status.source === 'env' && <>Using the key from the server's .env, ending in {status.last4}. Paste a key to replace it.</>}
            {status.source === 'none' && <span className="text-amber-400">No key yet. Chats on these models fail until you add one.</span>}
            {tab === 'openai' && ' This key also indexes uploaded documents, whichever chat model a user has.'}
          </p>
        </div>

        <div>
          <p className="text-xs text-text-muted mb-1.5">Models shown in the menus</p>
          <div className="rounded-xl border border-border divide-y divide-border">
            {models.map((m) => (
              <label key={m.id} className="flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-surface-2 transition-colors">
                <input
                  type="checkbox"
                  checked={m.enabled}
                  disabled={busy}
                  onChange={(e) => toggleModel(m.id, e.target.checked)}
                  className="w-3.5 h-3.5 accent-primary"
                />
                <span className="font-mono text-sm text-text-primary">{m.id}</span>
                <span className="text-xs text-text-dim truncate">{m.label}</span>
              </label>
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
      </div>
    </div>
  );
}
