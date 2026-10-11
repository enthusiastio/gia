import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Minus, Plus, Save } from 'lucide-react';
import { api, Language } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { cn } from '@/lib/utils';

const TABS: { id: Language; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Spanish' },
];

interface Row {
  /** Local only: keeps an input's identity when rows above it are removed. */
  id: number;
  text: string;
}

/** The questions offered on the empty chat screen, one list per language. */
export function StartersPanel() {
  const [tab, setTab] = useState<Language>('en');
  const [drafts, setDrafts] = useState<Record<Language, Row[]> | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextId = useRef(0);

  const toRows = (questions: string[]): Row[] => questions.map((text) => ({ id: nextId.current++, text }));

  useEffect(() => {
    api.admin.starters()
      .then((s) => setDrafts({ en: toRows(s.en), es: toRows(s.es) }))
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load the questions'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const rows = drafts?.[tab] ?? [];
  const setRows = (next: Row[]) => setDrafts((d) => (d ? { ...d, [tab]: next } : d));

  const switchTab = (next: Language) => {
    setTab(next);
    setSaved(false);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const next = await api.admin.saveStarters(tab, rows.map((r) => r.text));
      // Only this tab: the other language may hold edits not saved yet.
      setRows(toRows(next[tab]));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save the questions');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} className="self-start">
      <div className="bg-surface border border-border rounded-2xl p-5">
        <h2 className="text-sm font-semibold text-text-primary mb-1">Conversation starters</h2>
        <p className="text-xs text-text-dim mb-4 leading-relaxed">
          Questions offered on the empty chat screen. Each user sees three, picked at random from
          the list in their preferred language.
        </p>

        <div role="tablist" aria-label="Languages" className="flex gap-1 p-1 bg-surface-2 rounded-xl mb-4">
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
                  layoutId="starter-language-tab"
                  className="absolute inset-0 rounded-lg bg-surface border border-border"
                  transition={{ type: 'spring', stiffness: 500, damping: 40 }}
                />
              )}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>

        {drafts && (
          <div role="tabpanel" className="space-y-4">
            <div className="space-y-2">
              {rows.map((row, i) => (
                <div key={row.id} className="flex items-center gap-2">
                  <input
                    value={row.text}
                    onChange={(e) => setRows(rows.map((r) => (r.id === row.id ? { ...r, text: e.target.value } : r)))}
                    placeholder="A question a user might ask"
                    aria-label={`Question ${i + 1}`}
                    maxLength={200}
                    className="flex-1 min-w-0 bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-dim outline-none focus:border-primary/50 transition-colors"
                  />
                  <button
                    onClick={() => setRows(rows.filter((r) => r.id !== row.id))}
                    aria-label={`Remove question ${i + 1}`}
                    title="Remove"
                    className="flex-shrink-0 w-8 h-8 rounded-lg border border-border flex items-center justify-center text-text-muted hover:text-red-600 hover:border-red-500/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <Minus size={14} />
                  </button>
                </div>
              ))}

              {rows.length === 0 && (
                <p className="text-xs text-text-dim leading-relaxed">
                  {tab === 'en'
                    ? 'No questions yet. Users see no starters until you add some.'
                    : 'No questions yet. Users with this language see the English ones instead.'}
                </p>
              )}

              <button
                onClick={() => setRows([...rows, { id: nextId.current++, text: '' }])}
                className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-dashed border-border text-sm text-text-muted hover:text-text-primary hover:border-primary/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <Plus size={14} />
                Add question
              </button>
            </div>

            {error && <p className="text-xs text-red-600">{error}</p>}

            <Button onClick={save} disabled={saving} size="sm">
              {saved ? <Check size={14} /> : <Save size={14} />}
              {saving ? 'Saving…' : saved ? 'Saved' : `Save ${TABS.find((t) => t.id === tab)!.label} questions`}
            </Button>
          </div>
        )}

        {!drafts && error && <p className="text-xs text-red-600">{error}</p>}
      </div>
    </motion.div>
  );
}
