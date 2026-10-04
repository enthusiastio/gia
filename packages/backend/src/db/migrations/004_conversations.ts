import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('conversations', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('title').notNullable().defaultTo('New conversation');
    t.datetime('created_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
    t.datetime('updated_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('conversations');
}
