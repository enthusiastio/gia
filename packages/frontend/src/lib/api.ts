const BASE = '/api';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Request failed');
  }
  return res.json();
}

/**
 * Pulls a file through fetch rather than pointing an <a> at the URL, so an
 * auth or 404 failure surfaces as a thrown error instead of navigating the
 * admin away to a JSON error page.
 */
async function download(url: string, fallbackName: string): Promise<void> {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? 'Download failed');
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fallbackName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(objectUrl);
}

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_admin: boolean;
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface Source {
  file_id: string;
  file_name: string;
  title: string;
  heading: string | null;
  kind: 'pinned' | 'retrieved' | 'read';
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  image_path: string | null;
  sources?: Source[] | null;
  created_at: string;
}

export type DocumentStatus = 'pending' | 'processing' | 'ready' | 'failed';

export interface UserFile {
  id: string;
  original_name: string;
  mime_type: string;
  size: number;
  title: string | null;
  description: string | null;
  tags: string[] | null;
  always_include: boolean;
  document_date: string | null;
  status: DocumentStatus;
  error: string | null;
  chunk_count: number;
  ingested_at: string | null;
  created_at: string;
}

export interface DocumentPatch {
  title?: string | null;
  description?: string | null;
  tags?: string[];
  document_date?: string | null;
  always_include?: boolean;
}

export interface AdminUser extends User {
  model: string | null;
  model_provider: string | null;
  system_prompt: string | null;
  conversation_count: number;
  files?: UserFile[];
}

export const api = {
  auth: {
    me: () => request<User>(`${BASE}/auth/me`),
    logout: () => request<{ ok: boolean }>(`${BASE}/auth/logout`, { method: 'POST' }),
  },

  conversations: {
    list: () => request<Conversation[]>(`${BASE}/chat/conversations`),
    create: () => request<Conversation>(`${BASE}/chat/conversations`, { method: 'POST' }),
    delete: (id: string) => request<{ ok: boolean }>(`${BASE}/chat/conversations/${id}`, { method: 'DELETE' }),
    messages: (id: string) => request<Message[]>(`${BASE}/chat/conversations/${id}/messages`),
    sendMessage: (id: string, content: string, image?: File, attachment?: File) => {
      const form = new FormData();
      form.append('content', content);
      if (image) form.append('image', image);
      if (attachment) form.append('attachment', attachment);
      return request<Message>(`${BASE}/chat/conversations/${id}/messages`, { method: 'POST', body: form });
    },
  },

  files: {
    list: () => request<UserFile[]>(`${BASE}/files`),
    upload: (file: File, meta: { title?: string; description?: string } = {}) => {
      const form = new FormData();
      form.append('file', file);
      if (meta.title) form.append('title', meta.title);
      if (meta.description) form.append('description', meta.description);
      return request<UserFile>(`${BASE}/files`, { method: 'POST', body: form });
    },
    delete: (id: string) => request<{ ok: boolean }>(`${BASE}/files/${id}`, { method: 'DELETE' }),
  },

  admin: {
    users: () => request<AdminUser[]>(`${BASE}/admin/users`),
    user: (id: string) => request<AdminUser>(`${BASE}/admin/users/${id}`),
    updateConfig: (id: string, config: { model?: string; model_provider?: string; system_prompt?: string; is_admin?: boolean }) =>
      request<{ ok: boolean }>(`${BASE}/admin/users/${id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }),
    deleteUser: (id: string) =>
      request<{ ok: boolean }>(`${BASE}/admin/users/${id}`, { method: 'DELETE' }),
    uploadFile: (userId: string, file: File, meta: { title?: string; description?: string } = {}) => {
      const form = new FormData();
      form.append('file', file);
      if (meta.title) form.append('title', meta.title);
      if (meta.description) form.append('description', meta.description);
      return request<UserFile>(`${BASE}/admin/users/${userId}/files`, { method: 'POST', body: form });
    },
    updateFile: (userId: string, fileId: string, patch: DocumentPatch) =>
      request<UserFile>(`${BASE}/admin/users/${userId}/files/${fileId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      }),
    downloadFile: (userId: string, fileId: string, name: string) =>
      download(`${BASE}/admin/users/${userId}/files/${fileId}/download`, name),
    reingestFile: (userId: string, fileId: string) =>
      request<{ ok: boolean }>(`${BASE}/admin/users/${userId}/files/${fileId}/reingest`, { method: 'POST' }),
    deleteFile: (userId: string, fileId: string) =>
      request<{ ok: boolean }>(`${BASE}/admin/users/${userId}/files/${fileId}`, { method: 'DELETE' }),
  },
};
