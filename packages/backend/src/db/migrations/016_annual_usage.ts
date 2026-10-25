import { Knex } from 'knex';

/**
 * One annual allowance per user instead of a daily and a monthly one. Each
 * user's year runs from their own start date, so someone who pays in
 * November is not renewed in January. Top-ups are kept as rows: they count
 * only within the year they were bought in, and the admin can see them all.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    // null: the year runs from created_at.
    t.datetime('usage_period_start', { precision: 6 });
    t.dropColumn('usage_daily_reset_at');
    t.dropColumn('usage_monthly_reset_at');
  });

  await knex.schema.createTable('usage_topups', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.decimal('amount_usd', 12, 2).notNullable();
    t.datetime('created_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
    t.index(['user_id', 'created_at']);
  });

  await knex('app_settings').whereIn('key', ['daily_limit_usd', 'monthly_limit_usd']).delete();
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('usage_topups');
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('usage_period_start');
    t.datetime('usage_daily_reset_at', { precision: 6 });
    t.datetime('usage_monthly_reset_at', { precision: 6 });
  });
  await knex('app_settings').where({ key: 'annual_limit_usd' }).delete();
}
