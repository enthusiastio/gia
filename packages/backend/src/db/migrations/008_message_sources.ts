import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('messages', (t) => {
    t.json('sources');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('messages', (t) => {
    t.dropColumn('sources');
  });
}
