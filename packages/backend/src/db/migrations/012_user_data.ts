import { Knex } from 'knex';

/**
 * Every user now runs on the default system prompt. The per-user override
 * gives way to free-text details about the person, added to that prompt.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_configs', (t) => {
    t.text('user_data', 'mediumtext');
    t.dropColumn('system_prompt');
  });
}

/** Restores the column only: the override texts dropped by `up` are gone. */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_configs', (t) => {
    t.text('system_prompt', 'mediumtext');
    t.dropColumn('user_data');
  });
}
