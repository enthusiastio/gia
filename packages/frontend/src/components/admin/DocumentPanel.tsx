import { useEffect, useRef, useState } from 'react';
import {
  FileText, Upload, Trash2, RefreshCw, AlertCircle, Check,
  Loader2, Plus, Pencil, Download,
} from 'lucide-react';
import { api, DocumentPatch, UserFile } from '@/lib/api';
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

/** Same list the backend accepts; anything else is rejected there anyway. */
const ACCEPT = '.txt,.md,.markdown,.csv,.json,.pdf';

function Switch({ checked, disabled, onChange, label }: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs text-text-muted hover:text-text-primary disabled:opacity-40 transition-colors"
    >
      <span
        className={cn(
          'relative inline-flex h-4 w-7 flex-shrink-0 rounded-full transition-colors',
          checked ? 'bg-primary' : 'bg-border'
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-3 w-3 rounded-full bg-white transition-transform',
            checked ? 'translate-x-3.5' : 'translate-x-0.5'
          )}
        />
      </span>
      {label}
    </button>
  );
}

interface RowProps {
  file: UserFile;
  busy: boolean;
  onDelete: (fileId: string) => void;
  onDownload: (file: UserFile) => void;
  onReingest: (fileId: string) => void;
  onUpdate: (fileId: string, patch: DocumentPatch) => Promise<void>;
}

function DocumentRow({ file, busy, onDelete, onDownload, onReingest, onUpdate }: RowProps) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState('');
  const [saving, setSaving] = useState(false);

  const indexing = file.status === 'pending' || file.status === 'processing';

  const startEdit = () => {
    setTitle(file.title ?? '');
    setDescription(file.description ?? '');
    setTags((file.tags ?? []).join(', '));
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    await onUpdate(file.id, {
      title: title.trim() || null,
      description: description.trim() || null,
      tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
    });
    setSaving(false);
    setEditing(false);
  };

  const inputCls =
    'w-full bg-surface border border-border rounded-lg px-2.5 py-1.5 text-xs text-text-primary placeholder-text-dim outline-none focus:border-primary/50';

  return (
    <div className="rounded-xl border border-border bg-surface-2 px-3.5 py-3">
      <div className="flex items-start gap-3">
        <FileText size={15} className="mt-0.5 flex-shrink-0 text-accent" />

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-text-primary truncate">
              {file.title ?? (
                <span className="text-text-muted">{indexing ? 'Title is generated during indexing…' : file.original_name}</span>
              )}
            </p>
            <StatusPill file={file} />
          </div>

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
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Title"
                className={inputCls}
              />
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="What this document contains…"
                className={cn(inputCls, 'resize-none leading-relaxed')}
              />
              <input
                value={tags}
                onChange={(e) => setTags(e.target.value)}
                placeholder="Tags, comma separated"
                className={inputCls}
              />
              <p className="text-[11px] text-text-dim">Leave a field empty to have it generated again on the next re-index.</p>
              <div className="flex gap-2">
                <Button size="sm" onClick={save} disabled={saving}>
                  {saving ? 'Saving…' : 'Save'}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-xs text-text-muted leading-relaxed mt-1.5">
                {file.description ?? (
                  <span className="text-text-dim italic">
                    {indexing ? 'Summary is generated during indexing…' : 'No summary.'}
                  </span>
                )}
              </p>
              {file.tags && file.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {file.tags.map((tag) => (
                    <span key={tag} className="px-1.5 py-0.5 rounded-md bg-surface text-[11px] text-text-muted border border-border">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </>
          )}

          <div className="mt-2.5">
            <Switch
              checked={file.always_include}
              disabled={busy}
              onChange={(next) => onUpdate(file.id, { always_include: next })}
              label="Always include in full"
            />
          </div>
        </div>

        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={startEdit}
            disabled={busy || editing}
            title="Edit title, summary and tags"
            className="text-text-dim hover:text-text-primary disabled:opacity-30 transition-colors p-1.5"
          >
            <Pencil size={13} />
          </button>
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
            disabled={busy || indexing}
            title="Re-index this document"
            className="text-text-dim hover:text-text-primary disabled:opacity-30 transition-colors p-1.5"
          >
            <RefreshCw size={13} />
          </button>
          <button
            onClick={() => onDelete(file.id)}
            disabled={busy}
            title="Delete document"
            className="text-text-dim hover:text-red-400 disabled:opacity-30 transition-colors p-1.5"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

export function DocumentPanel({ userId }: { userId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<UserFile[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);

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
      await refresh().catch(console.error);
    } finally {
      setBusy(false);
    }
  };

  // One at a time, so a rejected file names itself and the ones before it
  // are already stored.
  const uploadFiles = (picked: File[]) => {
    if (picked.length === 0 || busy) return;
    guard(async () => {
      for (const file of picked) {
        try {
          await api.admin.uploadFile(userId, file);
        } catch (err) {
          throw new Error(`${file.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    });
  };

  const handlePicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = '';
    uploadFiles(picked);
  };

  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!e.dataTransfer.types.includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      // Moving over a child element also fires dragleave on the parent.
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      uploadFiles(Array.from(e.dataTransfer.files));
    },
  };

  const handleDelete = (fileId: string) =>
    guard(() => api.admin.deleteFile(userId, fileId));

  const handleDownload = (file: UserFile) =>
    guard(() => api.admin.downloadFile(userId, file.id, file.original_name));

  const handleReingest = (fileId: string) =>
    guard(() => api.admin.reingestFile(userId, fileId));

  const handleUpdate = async (fileId: string, patch: DocumentPatch) => {
    await guard(() => api.admin.updateFile(userId, fileId, patch));
  };

  const ready = files.filter((f) => f.status === 'ready').length;

  return (
    <div className="bg-surface border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <FileText size={15} className="text-text-muted" />
          <h2 className="text-sm font-semibold text-text-primary">Health Documents</h2>
          {files.length > 0 && (
            <span className="text-xs text-text-dim">{ready} of {files.length} indexed</span>
          )}
        </div>
        <Button size="sm" variant="outline" onClick={() => inputRef.current?.click()} disabled={busy}>
          {busy ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
          Upload documents
        </Button>
      </div>

      <p className="text-xs text-text-dim mb-4 leading-relaxed">
        Text, Markdown, CSV, JSON or PDF. Each document is indexed and given a title, summary and
        tags so the assistant can find it. Only this user's documents are ever searched when they
        ask a question. "Always include" sends a document in full with every message.
      </p>

      {error && (
        <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-xl bg-red-500/10 text-red-400">
          <AlertCircle size={13} className="mt-0.5 flex-shrink-0" />
          <p className="text-xs leading-relaxed">{error}</p>
        </div>
      )}

      {files.length === 0 ? (
        <div {...dropHandlers}>
          <button
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className={cn(
              'w-full rounded-xl border border-dashed px-4 py-8 text-center transition-colors disabled:opacity-40',
              dragging ? 'border-primary bg-primary/10' : 'border-border/70 hover:bg-surface-2'
            )}
          >
            <Upload size={16} className={cn('mx-auto mb-2', dragging ? 'text-primary' : 'text-text-dim')} />
            <p className="text-sm text-text-muted">{dragging ? 'Drop to upload' : 'No documents yet'}</p>
            <p className="text-xs text-text-dim mt-0.5">Drop files here or click to upload</p>
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          {files.map((file) => (
            <DocumentRow
              key={file.id}
              file={file}
              busy={busy}
              onDelete={handleDelete}
              onDownload={handleDownload}
              onReingest={handleReingest}
              onUpdate={handleUpdate}
            />
          ))}
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ACCEPT}
        className="hidden"
        onChange={handlePicked}
      />
    </div>
  );
}
