const BASE = '/api';

/** A failed request, with the HTTP status for callers that treat some differently. */
export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { credentials: 'include', ...init });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new ApiError(err.error ?? 'Request failed', res.status);
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

export type Language = 'en' | 'es';

export type ConversationStarters = Record<Language, string[]>;

export interface User {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  is_admin: boolean;
  /** Language of the empty chat screen and its conversation starters. */
  preferred_language: Language;
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

export interface UsageWindow {
  /** Share of the allowance spent, 0 to 1. */
  used: number;
  resets_at: string;
}

export interface UsageStatus {
  daily: UsageWindow;
  monthly: UsageWindow;
  /** The allowance that is blocking new messages, if any. */
  exhausted: 'daily' | 'monthly' | null;
}

/** One limit as the admin sees it, in USD. */
export interface UsageSpend {
  spent: number;
  limit: number;
  resets_at: string;
}

export interface UsageSpending {
  daily: UsageSpend;
  monthly: UsageSpend;
  /** Everything paid for this user this month: indexing and reset spending included. */
  month_cost: number;
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

export type ProviderId = 'openai' | 'claude' | 'gemini';

export interface ApiKeyStatus {
  /** saved: entered under General; env: from the server's .env; none: no key. */
  source: 'saved' | 'env' | 'none';
  last4: string | null;
}

export interface ModelOption {
  id: string;
  provider: ProviderId;
  label: string;
  /** Offered in the model dropdowns. */
  enabled: boolean;
}

export interface GeneralSettings {
  default_model: string | null;
  default_model_provider: string | null;
  default_system_prompt: string | null;
  /** What one user may spend on chat, in USD; null means the built-in default below. */
  daily_limit_usd: string | null;
  monthly_limit_usd: string | null;
  default_daily_limit_usd: number;
  default_monthly_limit_usd: number;
  /** DEFAULT_MODEL from the server's .env, used when no default model is set here. */
  server_default_model: string;
  api_keys: Record<ProviderId, ApiKeyStatus>;
  models: ModelOption[];
}

export type GeneralDefaults = Pick<
  GeneralSettings,
  'default_model' | 'default_model_provider' | 'default_system_prompt' | 'daily_limit_usd' | 'monthly_limit_usd'
>;

export interface AdminUser extends User {
  model: string | null;
  model_provider: string | null;
  /** Free-text details about the person, added to the default system prompt. */
  user_data: string | null;
  conversation_count: number;
  /** False until the person first signs in with Google. */
  has_signed_in: boolean;
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
    /** A fresh random few on every call. */
    starters: () => request<{ language: Language; questions: string[] }>(`${BASE}/chat/starters`),
    usage: () => request<UsageStatus>(`${BASE}/chat/usage`),
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
    settings: () => request<GeneralSettings>(`${BASE}/admin/settings`),
    saveSettings: (settings: GeneralDefaults) =>
      request<GeneralSettings>(`${BASE}/admin/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
    saveApiKey: (provider: ProviderId, apiKey: string) =>
      request<GeneralSettings>(`${BASE}/admin/settings/api-keys/${provider}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: apiKey }),
      }),
    removeApiKey: (provider: ProviderId) =>
      request<GeneralSettings>(`${BASE}/admin/settings/api-keys/${provider}`, { method: 'DELETE' }),
    saveEnabledModels: (enabled: string[]) =>
      request<GeneralSettings>(`${BASE}/admin/settings/models`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      }),
    starters: () => request<ConversationStarters>(`${BASE}/admin/starters`),
    saveStarters: (language: Language, questions: string[]) =>
      request<ConversationStarters>(`${BASE}/admin/starters/${language}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ questions }),
      }),
    createUser: (email: string, name?: string) =>
      request<AdminUser>(`${BASE}/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name }),
      }),
    user: (id: string) => request<AdminUser>(`${BASE}/admin/users/${id}`),
    updateConfig: (id: string, config: { model?: string; model_provider?: string; user_data?: string; preferred_language?: Language; is_admin?: boolean }) =>
      request<{ ok: boolean }>(`${BASE}/admin/users/${id}/config`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      }),
    usage: (id: string) => request<UsageSpending>(`${BASE}/admin/users/${id}/usage`),
    resetUsage: (id: string, window: 'daily' | 'monthly') =>
      request<UsageSpending>(`${BASE}/admin/users/${id}/usage/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ window }),
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
