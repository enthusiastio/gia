import { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  await knex.schema.createTable('messages', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    t.uuid('conversation_id').notNullable().references('id').inTable('conversations').onDelete('CASCADE');
    t.enum('role', ['user', 'assistant']).notNullable();
    // Attachments are inlined into the message, so TEXT's 64 KB is too small.
    t.text('content', 'longtext').notNullable();
    t.string('image_path');
    t.datetime('created_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTable('messages');
}
