import knex from '../db/knex';
import { logger } from '../logger';
import { CACHE_WRITE_MULTIPLIER, MODEL_CATALOG, ProviderId, WEB_SEARCH_PRICE } from './ai/models';
import { ChatUsage } from './ai/types';
import { getGeneralSettings } from './settings';

/** What a user may spend on chat per year when General sets no limit of its own. */
export const DEFAULT_ANNUAL_LIMIT_USD = 120;

/** The plans a user can be on, in months. */
export const PLAN_MONTHS = [6, 12] as const;
export type PlanMonths = (typeof PLAN_MONTHS)[number];

export const isPlanMonths = (value: unknown): value is PlanMonths => PLAN_MONTHS.includes(value as PlanMonths);

/**
 * Charged for a model missing from the catalogue (one named only in .env):
 * the dearest rates there, so an unpriced model can never run for free.
 */
const FALLBACK_PRICE = {
  provider: 'claude' as ProviderId,
  inputPrice: Math.max(...MODEL_CATALOG.map((m) => m.inputPrice)),
  cachedInputPrice: Math.max(...MODEL_CATALOG.map((m) => m.cachedInputPrice)),
  outputPrice: Math.max(...MODEL_CATALOG.map((m) => m.outputPrice)),
};

export function costOf(model: string, usage: ChatUsage): number {
  const price = MODEL_CATALOG.find((m) => m.id === model) ?? FALLBACK_PRICE;
  return (
    (usage.inputTokens * price.inputPrice +
      usage.cacheReadTokens * price.cachedInputPrice +
      usage.cacheWriteTokens * price.inputPrice * CACHE_WRITE_MULTIPLIER +
      usage.outputTokens * price.outputPrice) /
      1_000_000 +
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
      cache_read_tokens: usage.cacheReadTokens,
      cache_write_tokens: usage.cacheWriteTokens,
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

/** Months later, on the same day or the month's last if it is shorter: 31 Aug + 6 is 28 Feb, not 3 Mar. */
export function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  const day = next.getUTCDate();
  next.setUTCDate(1);
  next.setUTCMonth(next.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate();
  next.setUTCDate(Math.min(day, lastDay));
  return next;
}

export interface UsageTopup {
  id: string;
  amount_usd: number;
  created_at: string;
}

/** The allowance as the admin sees it, in money. */
export interface UsageSpending {
  plan_months: PlanMonths;
  spent: number;
  /** The base limit for the plan plus this period's top-ups. */
  limit: number;
  /** The yearly limit from General, scaled to the plan's length. */
  base_limit: number;
  period_start: string;
  /** When the plan ends. It does not renew by itself. */
  ends_at: string;
  /** True once the plan has ended and new messages are refused. */
  expired: boolean;
  /** Top-ups bought in this period; older ones no longer count. */
  topups: UsageTopup[];
  /** Everything paid for this user this period: document indexing included. */
  period_cost: number;
}

/** What a user has spent this period against their allowance. */
export async function getUsageSpending(userId: string): Promise<UsageSpending> {
  const [general, user] = await Promise.all([
    getGeneralSettings(),
    knex('users').where({ id: userId }).first('usage_period_start', 'created_at', 'plan_months'),
  ]);
  const planMonths: PlanMonths = isPlanMonths(user?.plan_months) ? user.plan_months : 12;
  const start = new Date(user?.usage_period_start ?? user?.created_at ?? Date.now());
  const end = addMonths(start, planMonths);

  const [spent, topups] = await Promise.all([
    knex('usage_events')
      .where({ user_id: userId })
      .where('created_at', '>=', start)
      .first(
        knex.raw('COALESCE(SUM(cost_usd), 0) AS total'),
        knex.raw("COALESCE(SUM(CASE WHEN kind = 'chat' THEN cost_usd ELSE 0 END), 0) AS chat")
      ) as unknown as Promise<{ total: string; chat: string }>,
    knex('usage_topups')
      .where({ user_id: userId })
      .where('created_at', '>=', start)
      .orderBy('created_at', 'asc')
      .select('id', 'amount_usd', 'created_at'),
  ]);

  const baseLimit = (parseLimit(general.annual_limit_usd, DEFAULT_ANNUAL_LIMIT_USD) * planMonths) / 12;
  const topupList: UsageTopup[] = topups.map((t) => ({
    id: t.id,
    amount_usd: Number(t.amount_usd),
    created_at: new Date(t.created_at).toISOString(),
  }));
  return {
    plan_months: planMonths,
    spent: Number(spent.chat),
    limit: baseLimit + topupList.reduce((sum, t) => sum + t.amount_usd, 0),
    base_limit: baseLimit,
    period_start: start.toISOString(),
    ends_at: end.toISOString(),
    expired: end <= new Date(),
    topups: topupList,
    period_cost: Number(spent.total),
  };
}

/** Adds to this period's allowance, for a user who paid for more. */
export async function addTopup(userId: string, amountUsd: number): Promise<void> {
  await knex('usage_topups').insert({ user_id: userId, amount_usd: amountUsd.toFixed(2) });
}

/** Takes back a top-up added by mistake. */
export async function removeTopup(userId: string, topupId: string): Promise<boolean> {
  return (await knex('usage_topups').where({ id: topupId, user_id: userId }).delete()) > 0;
}

/**
 * Starts the user's plan now, for when they pay for a new one. Spending and
 * top-ups from before no longer count; the rows themselves stay.
 */
export async function startNewPeriod(userId: string): Promise<void> {
  await knex('users').where({ id: userId }).update({ usage_period_start: knex.fn.now(6) });
}

/** Moves the user to another plan. The current period keeps its start, so its end moves with the plan. */
export async function setPlan(userId: string, planMonths: PlanMonths): Promise<void> {
  await knex('users').where({ id: userId }).update({ plan_months: planMonths });
}

/** Shares only: what the limit is in money is the operator's business. */
export interface UsageStatus {
  /** Share of the allowance spent, 0 to 1. */
  used: number;
  ends_at: string;
  /** True once the allowance is spent and new messages are refused. */
  exhausted: boolean;
  /** True once the plan has ended and new messages are refused. */
  expired: boolean;
}

/** Where a user stands against their allowance, as they are allowed to see it. */
export async function getUsageStatus(userId: string): Promise<UsageStatus> {
  const { spent, limit, ends_at, expired } = await getUsageSpending(userId);
  const used = spent / limit;
  return { used: Math.min(used, 1), ends_at, exhausted: used >= 1, expired };
}
