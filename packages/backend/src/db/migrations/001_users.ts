import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    t.string('google_id').notNullable().unique();
    t.string('email').notNullable().unique();
    t.string('name').notNullable();
    t.string('avatar_url');
    t.boolean('is_admin').notNullable().defaultTo(false);
    t.datetime('created_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('users');
}
