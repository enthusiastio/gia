import { Knex } from 'knex';

/**
 * Prompt caching splits input into three prices. input_tokens now holds only
 * the part billed at the full rate; these hold the cheap reads and the
 * dearer writes.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('usage_events', (t) => {
    t.integer('cache_read_tokens').unsigned().notNullable().defaultTo(0);
    t.integer('cache_write_tokens').unsigned().notNullable().defaultTo(0);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('usage_events', (t) => {
    t.dropColumn('cache_read_tokens');
    t.dropColumn('cache_write_tokens');
  });
}
