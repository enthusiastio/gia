import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, Plus, Save, SlidersHorizontal, Trash2, Users } from 'lucide-react';
import { api, AdminUser, GeneralSettings } from '@/lib/api';
import { DocumentPanel } from '@/components/admin/DocumentPanel';
import { GeneralPanel } from '@/components/admin/GeneralPanel';
import { ModelSelect } from '@/components/admin/ModelSelect';
import { Button } from '@/components/ui/Button';
import { useAuth } from '@/hooks/useAuth';

export default function Admin() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [selected, setSelected] = useState<AdminUser | null>(null);
  const [view, setView] = useState<'general' | 'user' | null>(null);
  const [settings, setSettings] = useState<GeneralSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const [model, setModel] = useState('');
  const [modelProvider, setModelProvider] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [addError, setAddError] = useState<string | null>(null);
  const [addBusy, setAddBusy] = useState(false);

  useEffect(() => {
    api.admin.users().then(setUsers).catch(console.error);
    api.admin.settings().then(setSettings).catch(console.error);
  }, []);

  const openGeneral = () => {
    setView('general');
    setSelected(null);
  };

  const selectUser = async (u: AdminUser) => {
    const detail = await api.admin.user(u.id);
    setSelected(detail);
    setView('user');
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
      setView(null);
      setConfirmingDelete(false);
      setUsers(await api.admin.users());
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  };

  // Adds the user and opens them straight away, so their documents can be
  // uploaded before they ever sign in.
  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddBusy(true);
    setAddError(null);
    try {
      const created = await api.admin.createUser(newEmail.trim(), newName.trim() || undefined);
      setUsers(await api.admin.users());
      setAdding(false);
      setNewEmail('');
      setNewName('');
      await selectUser(created);
    } catch (err) {
      setAddError(err instanceof Error ? err.message : 'Could not add the user');
    } finally {
      setAddBusy(false);
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
        {/* User list, with the add control where the new user will appear */}
        <div className="space-y-2 self-start">
          <button
            onClick={openGeneral}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl border transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${
              view === 'general' ? 'bg-primary/10 border-primary/40' : 'bg-surface border-border hover:bg-surface-2'
            }`}
          >
            <SlidersHorizontal size={15} className="text-text-muted flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary">General</p>
              <p className="text-xs text-text-dim truncate">
                Default model and prompt
              </p>
            </div>
          </button>

          <div className="bg-surface border border-border rounded-2xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
              <Users size={15} className="text-text-muted" />
              <h2 className="text-sm font-medium text-text-primary">Users ({users.length})</h2>
            </div>
            <div className="divide-y divide-border">
              {users.map((u) => (
                <motion.button
                  key={u.id}
                  layout="position"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
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
                    {u.has_signed_in
                      ? <span>{u.conversation_count} convs</span>
                      : <span className="text-amber-400">not signed in yet</span>}
                    {u.is_admin && <span className="text-primary">admin</span>}
                    {u.model && <span className="text-accent truncate">{u.model}</span>}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          <AnimatePresence mode="wait" initial={false}>
            {adding ? (
              <motion.form
                key="form"
                onSubmit={handleAdd}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.15 }}
                className="bg-surface border border-primary/40 rounded-2xl px-4 py-3 space-y-2"
              >
                <input
                  type="email"
                  required
                  autoFocus
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Their Google email"
                  className="w-full bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-dim outline-none focus:border-primary/50"
                />
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name (optional)"
                  className="w-full bg-surface-2 border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-dim outline-none focus:border-primary/50"
                />
                {addError && <p className="text-xs text-red-400">{addError}</p>}
                <p className="text-[11px] text-text-dim leading-relaxed">
                  They can sign in once added. Documents you upload now will be waiting for them.
                </p>
                <div className="flex gap-2">
                  <Button type="submit" size="sm" disabled={addBusy}>{addBusy ? 'Adding…' : 'Add user'}</Button>
                  <Button type="button" size="sm" variant="ghost" onClick={() => { setAdding(false); setAddError(null); }}>
                    Cancel
                  </Button>
                </div>
              </motion.form>
            ) : (
              <motion.button
                key="add"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                onClick={() => setAdding(true)}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-dashed border-border text-text-muted hover:text-text-primary hover:border-primary/40 hover:bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <span className="w-8 h-8 rounded-full border border-dashed border-current flex items-center justify-center flex-shrink-0">
                  <Plus size={14} />
                </span>
                <span className="text-sm">Add user</span>
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* General settings or user detail */}
        {view === 'general' && settings ? (
          <GeneralPanel settings={settings} onSaved={setSettings} />
        ) : selected ? (
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

              {!selected.has_signed_in && (
                <p className="text-xs text-amber-400 bg-amber-500/10 rounded-xl px-3 py-2 -mt-2 mb-4 leading-relaxed">
                  Not signed in yet. When they sign in with Google as {selected.email}, this
                  configuration and their documents become theirs.
                </p>
              )}

              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">AI Model</label>
                  <ModelSelect
                    value={model}
                    onChange={(m, p) => { setModel(m); setModelProvider(p); }}
                    defaultLabel={`Default (${settings?.default_model ?? settings?.server_default_model ?? 'General'})`}
                  />
                </div>

                <div>
                  <label className="block text-xs text-text-muted mb-1.5">System Prompt</label>
                  <textarea
                    value={systemPrompt}
                    onChange={(e) => setSystemPrompt(e.target.value)}
                    placeholder={settings?.default_system_prompt
                      ? 'Empty: uses the default prompt from General'
                      : 'You are a personalized genetic health assistant...'}
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
            Choose General to set the defaults, or a user to manage their own settings
          </div>
        )}
      </div>
    </div>
  );
}
