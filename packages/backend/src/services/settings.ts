import knex from '../db/knex';
import { logger } from '../logger';
import { ENV_KEY_NAMES, MODEL_CATALOG, ProviderId } from './ai/models';
import { decryptSecret, encryptSecret } from './secrets';

export interface GeneralSettings {
  default_model: string | null;
  default_model_provider: string | null;
  default_system_prompt: string | null;
}

const KEYS: (keyof GeneralSettings)[] = ['default_model', 'default_model_provider', 'default_system_prompt'];

/** Last resort when neither the user nor General names a model. */
export const SERVER_DEFAULT_MODEL = process.env.DEFAULT_MODEL || 'claude-opus-4-8';
const FALLBACK_SYSTEM_PROMPT = 'You are a helpful assistant.';

export async function getGeneralSettings(): Promise<GeneralSettings> {
  const rows: { key: string; value: string | null }[] = await knex('app_settings').whereIn('key', KEYS);
  const values = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  return Object.fromEntries(KEYS.map((k) => [k, values[k] || null])) as unknown as GeneralSettings;
}

/** Saves the given keys; an empty value clears the setting. */
export async function saveGeneralSettings(patch: Partial<GeneralSettings>): Promise<GeneralSettings> {
  for (const key of KEYS) {
    if (patch[key] === undefined) continue;
    const value = patch[key]?.trim() || null;
    await knex('app_settings')
      .insert({ key, value })
      .onConflict('key')
      .merge({ value, updated_at: knex.fn.now(6) });
  }
  return getGeneralSettings();
}

export interface UserAIConfig {
  model: string;
  /** null lets getAIProvider fall back to AI_PROVIDER. */
  provider: string | null;
  systemPrompt: string;
}

/**
 * What a user's chat and document indexing run on: their own settings first,
 * then General, then the server's .env. Model and provider are taken as a
 * pair from the same level, so a model never runs against the wrong provider.
 */
export async function resolveUserAIConfig(userId: string): Promise<UserAIConfig> {
  const [config] = await knex('user_configs').where({ user_id: userId });
  const general = await getGeneralSettings();

  const [model, provider] = config?.model
    ? [config.model, config.model_provider || null]
    : general.default_model
      ? [general.default_model, general.default_model_provider]
      : [SERVER_DEFAULT_MODEL, null];

  return {
    model,
    provider,
    systemPrompt: config?.system_prompt?.trim() || general.default_system_prompt?.trim() || FALLBACK_SYSTEM_PROMPT,
  };
}

async function readSetting(key: string): Promise<string | null> {
  const row = await knex('app_settings').where({ key }).first('value');
  return row?.value || null;
}

async function writeSetting(key: string, value: string | null): Promise<void> {
  await knex('app_settings')
    .insert({ key, value })
    .onConflict('key')
    .merge({ value, updated_at: knex.fn.now(6) });
}

const apiKeySetting = (provider: ProviderId) => `api_key_${provider}`;

/**
 * The key a provider call uses: the one saved under General, else the
 * server's .env. Read on every call, so a newly saved key applies at once.
 */
export async function getApiKey(provider: ProviderId): Promise<string | null> {
  const stored = await readSetting(apiKeySetting(provider));
  if (stored) {
    const key = decryptSecret(stored);
    if (key) return key;
    logger.error(`[settings] saved ${provider} API key cannot be decrypted; falling back to .env`);
  }
  return process.env[ENV_KEY_NAMES[provider]] || null;
}

export async function saveApiKey(provider: ProviderId, apiKey: string): Promise<void> {
  await writeSetting(apiKeySetting(provider), encryptSecret(apiKey.trim()));
}

export async function removeApiKey(provider: ProviderId): Promise<void> {
  await writeSetting(apiKeySetting(provider), null);
}

export interface ApiKeyStatus {
  /** saved: entered under General; env: from the server's .env; none: no key at all. */
  source: 'saved' | 'env' | 'none';
  /** Last four characters, so admins can tell keys apart without seeing them. */
  last4: string | null;
}

/** What the admin UI may know about a key: never the key itself. */
export async function getApiKeyStatus(provider: ProviderId): Promise<ApiKeyStatus> {
  const stored = await readSetting(apiKeySetting(provider));
  const saved = stored ? decryptSecret(stored) : null;
  if (saved) return { source: 'saved', last4: saved.slice(-4) };
  const env = process.env[ENV_KEY_NAMES[provider]];
  if (env) return { source: 'env', last4: env.slice(-4) };
  return { source: 'none', last4: null };
}

/**
 * Model ids the dropdowns offer. Never saved means all of them; this only
 * changes what can be picked, not what users already have.
 */
export async function getEnabledModels(): Promise<string[]> {
  const stored = await readSetting('enabled_models');
  if (!stored) return MODEL_CATALOG.map((m) => m.id);
  try {
    const ids = JSON.parse(stored);
    return Array.isArray(ids) ? ids.filter((id) => typeof id === 'string') : MODEL_CATALOG.map((m) => m.id);
  } catch {
    return MODEL_CATALOG.map((m) => m.id);
  }
}

export async function setEnabledModels(ids: string[]): Promise<string[]> {
  const known = new Set(MODEL_CATALOG.map((m) => m.id));
  const clean = [...new Set(ids.filter((id) => known.has(id)))];
  await writeSetting('enabled_models', JSON.stringify(clean));
  return clean;
}
