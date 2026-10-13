import { Knex } from 'knex';

/**
 * One row per paid model call made for a user, with its cost fixed at the
 * prices of the day. The daily and monthly limits are sums over this table.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('usage_events', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    // No foreign key: deleting a conversation must not erase what it cost.
    t.uuid('conversation_id');
    // chat counts towards the user's limits; ingest (document indexing) is only recorded.
    t.enum('kind', ['chat', 'ingest']).notNullable();
    t.string('provider').notNullable();
    t.string('model').notNullable();
    t.integer('input_tokens').unsigned().notNullable().defaultTo(0);
    t.integer('output_tokens').unsigned().notNullable().defaultTo(0);
    t.integer('web_searches').unsigned().notNullable().defaultTo(0);
    t.decimal('cost_usd', 12, 6).notNullable().defaultTo(0);
    t.datetime('created_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
    t.index(['user_id', 'created_at']);
  });

  // An admin's reset: chat spending before these moments no longer counts
  // towards the limit. The rows themselves stay, so the real cost is kept.
  await knex.schema.alterTable('users', (t) => {
    t.datetime('usage_daily_reset_at', { precision: 6 });
    t.datetime('usage_monthly_reset_at', { precision: 6 });
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('usage_daily_reset_at');
    t.dropColumn('usage_monthly_reset_at');
  });
  await knex.schema.dropTable('usage_events');
}
