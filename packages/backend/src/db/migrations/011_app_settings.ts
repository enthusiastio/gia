import { Knex } from 'knex';

/** App-wide settings the admin edits under "General", one row per key. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('app_settings', (t) => {
    t.string('key').primary();
    t.text('value', 'mediumtext');
    t.datetime('updated_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('app_settings');
}
