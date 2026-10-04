import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('user_files', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('original_name').notNullable();
    t.string('storage_path').notNullable();
    t.string('mime_type').notNullable();
    t.integer('size').notNullable();
    t.datetime('created_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('user_files');
}
