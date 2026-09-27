import { useEffect, useRef, useState } from 'react';
import {
  FileText, Upload, Trash2, RefreshCw, AlertCircle, Check,
  Loader2, Plus, Pencil, Download,
} from 'lucide-react';
import { api, DocumentCategory, UserFile } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { formatBytes, formatRelativeTime, cn } from '@/lib/utils';

const POLL_MS = 2500;

function StatusPill({ file }: { file: UserFile }) {
  const map = {
    pending: { label: 'Queued', cls: 'bg-amber-500/10 text-amber-400', icon: Loader2, spin: false },
    processing: { label: 'Indexing', cls: 'bg-blue-500/10 text-blue-400', icon: Loader2, spin: true },
    ready: { label: `${file.chunk_count} chunks`, cls: 'bg-emerald-500/10 text-emerald-400', icon: Check, spin: false },
    failed: { label: 'Failed', cls: 'bg-red-500/10 text-red-400', icon: AlertCircle, spin: false },
  }[file.status];
  const Icon = map.icon;

  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium', map.cls)}>
      <Icon size={11} className={map.spin ? 'animate-spin' : undefined} />
      {map.label}
    </span>
  );
}

interface SlotProps {
  category: DocumentCategory;
  file?: UserFile;
  busy: boolean;
  onUpload: (category: string, file: File) => void;
  onDelete: (fileId: string) => void;
  onDownload: (file: UserFile) => void;
  onReingest: (fileId: string) => void;
  onSaveDescription: (fileId: string, description: string) => Promise<void>;
}

function DocumentSlot({ category, file, busy, onUpload, onDelete, onDownload, onReingest, onSaveDescription }: SlotProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingDesc, setSavingDesc] = useState(false);

  const pick = () => inputRef.current?.click();

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    if (picked) onUpload(category.value, picked);
    if (inputRef.current) inputRef.current.value = '';
  };

  const startEdit = () => {
    setDraft(file?.description ?? '');
    setEditing(true);
  };

  const save = async () => {
    if (!file) return;
    setSavingDesc(true);
    await onSaveDescription(file.id, draft);
    setSavingDesc(false);
    setEditing(false);
  };

  return (
    <div
      className={cn(
        'rounded-xl border px-3.5 py-3 transition-colors',
        file ? 'border-border bg-surface-2' : 'border-dashed border-border/70 bg-transparent'
      )}
    >
      <div className="flex items-start gap-3">
        <FileText size={15} className={cn('mt-0.5 flex-shrink-0', file ? 'text-accent' : 'text-text-dim')} />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-text-primary">{category.label}</p>
            {file && <StatusPill file={file} />}
          </div>

          {file ? (
            <>
              <p className="text-xs text-text-dim mt-0.5 truncate">
                {file.original_name} · {formatBytes(file.size)}
                {file.document_date && ` · dated ${file.document_date.slice(0, 10)}`}
                {` · ${formatRelativeTime(file.created_at)}`}
              </p>

              {file.status === 'failed' && file.error && (
                <p className="text-xs text-red-400 mt-1.5 leading-relaxed">{file.error}</p>
              )}

              {editing ? (
                <div className="mt-2 space-y-2">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={3}
                    placeholder="What this document contains…"
                    className="w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-dim outline-none focus:border-primary/50 resize-none leading-relaxed"
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={save} disabled={savingDesc}>
                      {savingDesc ? 'Saving…' : 'Save'}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={startEdit}
                  className="group mt-1.5 flex items-start gap-1.5 text-left w-full"
                  title="Edit description"
                >
                  <p className="text-xs text-text-muted leading-relaxed flex-1">
                    {file.description ?? (
                      <span className="text-text-dim italic">
                        {file.status === 'ready' ? 'No description.' : 'Description is generated during indexing…'}
                      </span>
                    )}
                  </p>
                  <Pencil size={11} className="mt-0.5 text-text-dim opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                </button>
              )}
            </>
          ) : (
            <p className="text-xs text-text-dim mt-0.5">Not uploaded</p>
          )}
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          {file ? (
            <>
              <button
                onClick={() => onDownload(file)}
                disabled={busy}
                title="Download original document"
                className="text-text-dim hover:text-text-primary disabled:opacity-30 transition-colors p-1.5"
              >
                <Download size={13} />
              </button>
              <button
                onClick={() => onReingest(file.id)}
                disabled={busy || file.status === 'processing' || file.status === 'pending'}
                title="Re-index this document"
                className="text-text-dim hover:text-text-primary disabled:opacity-30 transition-colors p-1.5"
              >
                <RefreshCw size={13} />
              </button>
              <button
                onClick={pick}
                disabled={busy}
                title="Replace document"
                className="text-text-dim hover:text-text-primary disabled:opacity-30 transition-colors p-1.5"
              >
                <Upload size={13} />
              </button>
              <button
                onClick={() => onDelete(file.id)}
                disabled={busy}
                title="Delete document"
                className="text-text-dim hover:text-red-400 disabled:opacity-30 transition-colors p-1.5"
              >
                <Trash2 size={13} />
              </button>
            </>
          ) : (
            <Button size="sm" variant="outline" onClick={pick} disabled={busy}>
              <Plus size={13} />
              Upload
            </Button>
          )}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept=".md,.markdown,.txt,.pdf"
        className="hidden"
        onChange={handleChange}
      />
    </div>
  );
}

export function DocumentPanel({ userId }: { userId: string }) {
  const [categories, setCategories] = useState<DocumentCategory[]>([]);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.admin.documentCategories().then(setCategories).catch(console.error);
  }, []);

  const refresh = async () => {
    const detail = await api.admin.user(userId);
    setFiles(detail.files ?? []);
    return detail.files ?? [];
  };

  useEffect(() => {
    setFiles([]);
    refresh().catch(console.error);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  // Ingestion is asynchronous, so poll while anything is still in flight.
  useEffect(() => {
    const inFlight = files.some((f) => f.status === 'pending' || f.status === 'processing');
    if (!inFlight) return;
    const timer = setTimeout(() => { refresh().catch(console.error); }, POLL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, userId]);

  const guard = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleUpload = (category: string, file: File) =>
    guard(() => api.admin.uploadFile(userId, file, category));

  const handleDelete = (fileId: string) =>
    guard(() => api.admin.deleteFile(userId, fileId));

  const handleDownload = (file: UserFile) =>
    guard(() => api.admin.downloadFile(userId, file.id, file.original_name));

  const handleReingest = (fileId: string) =>
    guard(() => api.admin.reingestFile(userId, fileId));

  const handleSaveDescription = async (fileId: string, description: string) => {
    await guard(() => api.admin.updateFile(userId, fileId, { description }));
  };

  const byCategory = new Map(files.map((f) => [f.category, f]));
  const ready = files.filter((f) => f.status === 'ready').length;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Health Documents</h2>
        </div>
        <p className="text-xs text-text-dim">{ready} of {categories.length} indexed</p>
      </div>

      <p className="text-xs text-text-dim mb-4 leading-relaxed">
        One Markdown document per category. Uploading replaces the existing one and re-indexes it
        for retrieval. Only this user's documents are ever searched when they ask a question.
      </p>

      {error && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-xl bg-red-500/10 text-red-400">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <p className="text-xs leading-relaxed">{error}</p>
        </div>
      )}

      <div className="space-y-2">
        {categories.map((category) => (
          <DocumentSlot
            key={category.value}
            category={category}
            file={byCategory.get(category.value)}
            busy={busy}
            onUpload={handleUpload}
            onDelete={handleDelete}
            onDownload={handleDownload}
            onReingest={handleReingest}
            onSaveDescription={handleSaveDescription}
          />
        ))}
      </div>
    </div>
  );
}
