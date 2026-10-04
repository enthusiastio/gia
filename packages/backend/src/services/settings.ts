import knex from '../db/knex';

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
