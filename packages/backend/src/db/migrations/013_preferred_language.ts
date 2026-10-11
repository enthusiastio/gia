import { Knex } from 'knex';

/** The language a user's empty chat screen and conversation starters are shown in. */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.string('preferred_language', 2).notNullable().defaultTo('en');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('preferred_language');
  });
}
