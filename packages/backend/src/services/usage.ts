import knex from '../db/knex';
import { logger } from '../logger';
import { MODEL_CATALOG, ProviderId, WEB_SEARCH_PRICE } from './ai/models';
import { ChatUsage } from './ai/types';
import { getGeneralSettings } from './settings';

/** What a user may spend on chat when General sets no limit of its own. */
export const DEFAULT_DAILY_LIMIT_USD = 1;
export const DEFAULT_MONTHLY_LIMIT_USD = 10;

/**
 * Charged for a model missing from the catalogue (one named only in .env):
 * the dearest rates there, so an unpriced model can never run for free.
 */
const FALLBACK_PRICE = {
  provider: 'claude' as ProviderId,
  inputPrice: Math.max(...MODEL_CATALOG.map((m) => m.inputPrice)),
  outputPrice: Math.max(...MODEL_CATALOG.map((m) => m.outputPrice)),
};

export function costOf(model: string, usage: ChatUsage): number {
  const price = MODEL_CATALOG.find((m) => m.id === model) ?? FALLBACK_PRICE;
  return (
    (usage.inputTokens * price.inputPrice + usage.outputTokens * price.outputPrice) / 1_000_000 +
    (usage.webSearches * WEB_SEARCH_PRICE[price.provider]) / 1000
  );
}

interface UsageRecord {
  userId: string;
  conversationId?: string;
  kind: 'chat' | 'ingest';
  provider: string | null;
  model: string;
  usage: ChatUsage;
}

/** Never throws: the answer is already paid for, and losing it over bookkeeping helps nobody. */
export async function recordUsage({ userId, conversationId, kind, provider, model, usage }: UsageRecord): Promise<void> {
  try {
    await knex('usage_events').insert({
      user_id: userId,
      conversation_id: conversationId ?? null,
      kind,
      provider: provider ?? MODEL_CATALOG.find((m) => m.id === model)?.provider ?? 'claude',
      model,
      input_tokens: usage.inputTokens,
      output_tokens: usage.outputTokens,
      web_searches: usage.webSearches,
      cost_usd: costOf(model, usage).toFixed(6),
    });
  } catch (err) {
    logger.error('[usage] could not record', kind, model, usage, err);
  }
}

function parseLimit(value: string | null, fallback: number): number {
  const limit = Number(value);
  return value !== null && Number.isFinite(limit) && limit > 0 ? limit : fallback;
}

/** One limit as the admin sees it, in money. */
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

const later = (a: Date, b: Date | null) => (b && b > a ? b : a);

/**
 * What a user has spent against both limits. Windows are calendar days and
 * months in UTC, so nothing has to run to reset them: a new window simply has
 * no spending in it yet. An admin's reset moves a window's start forward.
 */
export async function getUsageSpending(userId: string): Promise<UsageSpending> {
  const now = new Date();
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const [general, user] = await Promise.all([
    getGeneralSettings(),
    knex('users').where({ id: userId }).first('usage_daily_reset_at', 'usage_monthly_reset_at'),
  ]);
  const countedSince = (start: Date) =>
    knex.raw("COALESCE(SUM(CASE WHEN kind = 'chat' AND created_at >= ? THEN cost_usd ELSE 0 END), 0)", [start]);
  const spent = (await knex('usage_events')
    .where({ user_id: userId })
    .where('created_at', '>=', monthStart)
    .first(
      knex.raw('COALESCE(SUM(cost_usd), 0) AS total'),
      knex.raw('? AS month', [countedSince(later(monthStart, user?.usage_monthly_reset_at ?? null))]),
      knex.raw('? AS day', [countedSince(later(dayStart, user?.usage_daily_reset_at ?? null))])
    )) as unknown as { total: string; month: string; day: string };

  return {
    daily: {
      spent: Number(spent.day),
      limit: parseLimit(general.daily_limit_usd, DEFAULT_DAILY_LIMIT_USD),
      resets_at: new Date(dayStart.getTime() + 24 * 60 * 60 * 1000).toISOString(),
    },
    monthly: {
      spent: Number(spent.month),
      limit: parseLimit(general.monthly_limit_usd, DEFAULT_MONTHLY_LIMIT_USD),
      resets_at: new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1)).toISOString(),
    },
    month_cost: Number(spent.total),
  };
}

/**
 * Lets a user who hit a limit talk again. Resetting the month resets the day
 * with it: a month's allowance is no use behind a spent daily one.
 */
export async function resetUsage(userId: string, window: 'daily' | 'monthly'): Promise<void> {
  const now = knex.fn.now(6);
  await knex('users')
    .where({ id: userId })
    .update(
      window === 'monthly'
        ? { usage_daily_reset_at: now, usage_monthly_reset_at: now }
        : { usage_daily_reset_at: now }
    );
}

export interface UsageWindow {
  /** Share of the limit spent, 0 to 1. */
  used: number;
  resets_at: string;
}

/** Shares only: what the limits are in money is the operator's business. */
export interface UsageStatus {
  daily: UsageWindow;
  monthly: UsageWindow;
  /** The window that is blocking new messages, if any. */
  exhausted: 'daily' | 'monthly' | null;
}

/** Where a user stands against both limits, as they are allowed to see it. */
export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const { daily, monthly } = await getUsageSpending(userId);
  const dailyUsed = daily.spent / daily.limit;
  const monthlyUsed = monthly.spent / monthly.limit;
  return {
    daily: { used: Math.min(dailyUsed, 1), resets_at: daily.resets_at },
    monthly: { used: Math.min(monthlyUsed, 1), resets_at: monthly.resets_at },
    // Monthly first: when both are spent, it is the one the user waits for.
    exhausted: monthlyUsed >= 1 ? 'monthly' : dailyUsed >= 1 ? 'daily' : null,
  };
}
