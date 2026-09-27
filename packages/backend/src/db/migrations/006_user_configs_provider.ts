import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_configs', (t) => {
    t.string('model_provider');
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('user_configs', (t) => {
    t.dropColumn('model_provider');
  });
}
