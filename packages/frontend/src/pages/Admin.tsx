import { useState, useEffect } from 'react';

const MODEL_PROVIDERS: Record<string, string> = {
  'claude-fable-5': 'claude', 'claude-opus-4-8': 'claude', 'claude-sonnet-4-6': 'claude', 'claude-haiku-4-5': 'claude',
  'gpt-5.5': 'openai', 'gpt-5.4': 'openai', 'gpt-5.4-mini': 'openai', 'gpt-4o': 'openai',
  'gemini-3.5-flash': 'gemini', 'gemini-2.5-pro': 'gemini', 'gemini-2.5-flash': 'gemini',
};
import { motion } from 'framer-motion';
import { ArrowLeft, Save, Trash2, Users } from 'lucide-react';
import { api, AdminUser } from '@/lib/api';
import { DocumentPanel } from '@/components/admin/DocumentPanel';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState('');
  const [modelProvider, setModelProvider] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);


  useEffect(() => {
    api.admin.users().then(setUsers).catch(console.error);
  }, []);

  const selectUser = async (u: AdminUser) => {
    const detail = await api.admin.user(u.id);
    setSelected(detail);
    setModel(detail.model ?? '');
    setModelProvider(detail.model_provider ?? '');
    setSystemPrompt(detail.system_prompt ?? '');
    setConfirmingDelete(false);
    setDeleteError(null);
  };

  const handleDelete = async () => {
    if (!selected) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await api.admin.deleteUser(selected.id);
      setSelected(null);
      setConfirmingDelete(false);
      setUsers(await api.admin.users());
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    setSaving(true);
    await api.admin.updateConfig(selected.id, { model, model_provider: modelProvider, system_prompt: systemPrompt });
    setSaving(false);
    const updated = await api.admin.users();
    setUsers(updated);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-surface px-4 py-3 flex items-center gap-4">
        <a href="/chat" className="text-text-muted hover:text-text-primary transition-colors">
          <ArrowLeft size={18} />
        </a>
        <h1 className="text-sm font-semibold text-text-primary">Admin Panel</h1>
      </div>

      <div className="max-w-5xl mx-auto p-4 md:p-6 grid md:grid-cols-[280px_1fr] gap-4">
        {/* User list */}
        <div className="bg-surface border border-border rounded-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
            <Users size={15} className="text-text-muted" />
            <h2 className="text-sm font-medium text-text-primary">Users ({users.length})</h2>
          </div>
          <div className="divide-y divide-border">
            {users.map((u) => (
              <button
                key={u.id}
                onClick={() => selectUser(u)}
                className={`w-full text-left px-4 py-3 hover:bg-surface-2 transition-colors ${selected?.id === u.id ? 'bg-primary/10' : ''}`}
              >
                <div className="flex items-center gap-3">
                  {u.avatar_url ? (
                    <img src={u.avatar_url} alt={u.name} className="w-8 h-8 rounded-full flex-shrink-0" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-xs text-primary font-medium flex-shrink-0">
                      {u.name[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">{u.name}</p>
                    <p className="text-xs text-text-dim truncate">{u.email}</p>
                  </div>
                </div>
                <div className="flex gap-3 mt-1.5 pl-11 text-xs text-text-dim">
                  <span>{u.conversation_count} convs</span>
                  {u.is_admin && <span className="text-primary">admin</span>}
                  {u.model && <span className="text-accent truncate">{u.model}</span>}
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* User detail */}
        {selected ? (
          <motion.div
            key={selected.id}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            className="space-y-4"
          >
            {/* Config card */}
            <div className="bg-surface border border-border rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-text-primary mb-4">
                {selected.name} — Configuration
              </h2>

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">AI Model</label>
                  <select
                    value={model}
                    onChange={(e) => { setModel(e.target.value); setModelProvider(MODEL_PROVIDERS[e.target.value] ?? ''); }}
                    className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary outline-none focus:border-primary/50 transition-colors font-mono"
                  >
                    <option value="">Default (system default)</option>
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
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1.5">System Prompt</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder="You are a personalized genetic health assistant..."
                    rows={5}
                    className="w-full bg-surface-2 border border-border rounded-xl px-3 py-2 text-sm text-text-primary placeholder-text-dim outline-none focus:border-primary/50 transition-colors resize-none leading-relaxed"
                  />
                </div>

                <Button onClick={handleSave} disabled={saving} size="sm">
                  <Save size={14} />
                  {saving ? 'Saving…' : 'Save configuration'}
                </Button>
              </div>
            </div>

            <DocumentPanel userId={selected.id} />

            {/* Danger zone */}
            {currentUser?.id !== selected.id && (
              <div className="bg-surface border border-red-500/30 rounded-2xl p-5">
                <h2 className="text-sm font-semibold text-text-primary mb-1">Delete user</h2>
                <p className="text-xs text-text-muted mb-4 leading-relaxed">
                  Permanently removes {selected.name} along with their configuration,
                  {' '}{selected.conversation_count} conversation{selected.conversation_count === 1 ? '' : 's'} and
                  {' '}{selected.files?.length ?? 0} document{selected.files?.length === 1 ? '' : 's'}. This cannot be undone.
                </p>

                {deleteError && (
                  <p className="text-xs text-red-400 mb-3">{deleteError}</p>
                )}

                {confirmingDelete ? (
                  <div className="flex items-center gap-2">
                    <Button onClick={handleDelete} disabled={deleting} variant="danger" size="sm">
                      <Trash2 size={14} />
                      {deleting ? 'Deleting…' : `Yes, delete ${selected.email}`}
                    </Button>
                    <Button onClick={() => setConfirmingDelete(false)} disabled={deleting} variant="ghost" size="sm">
                      Cancel
                    </Button>
                  </div>
                ) : (
                  <Button onClick={() => setConfirmingDelete(true)} variant="danger" size="sm">
                    <Trash2 size={14} />
                    Delete user
                  </Button>
                )}
              </div>
            )}
          </motion.div>
        ) : (
          <div className="flex items-center justify-center text-text-dim text-sm bg-surface border border-border rounded-2xl">
            Select a user to manage their configuration
          </div>
        )}
      </div>
    </div>
  );
}
