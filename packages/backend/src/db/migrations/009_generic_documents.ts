import { Knex } from 'knex';
import { DOCUMENT_CATEGORIES } from './007_document_ingestion';

/**
 * Documents stop being one-per-category slots: any number per user, each with
 * an AI-written title, summary and tags, and an admin toggle that replaces the
 * old "pinned categories".
 */
export async function up(knex: Knex): Promise<void> {
  // The (user_id, category) indexes double as the user_id foreign keys'
  // indexes, so InnoDB refuses to drop them until a plain one takes over.
  await knex.raw('CREATE INDEX user_files_user_id_idx ON user_files (user_id)');
  await knex.raw('DROP INDEX user_files_user_category_unique ON user_files');
  await knex.raw('ALTER TABLE user_files DROP CONSTRAINT user_files_category_check');

  await knex.schema.alterTable('user_files', (t) => {
    t.dropColumn('category');
    t.string('title');
    t.json('tags');
    t.boolean('always_include').notNullable().defaultTo(false);
  });

  await knex.raw('CREATE INDEX file_chunks_user_id_idx ON file_chunks (user_id)');
  await knex.raw('DROP INDEX file_chunks_user_category_idx ON file_chunks');
  await knex.schema.alterTable('file_chunks', (t) => {
    t.dropColumn('category');
  });
}

/**
 * Lossy: category comes back nullable and empty, since documents uploaded
 * after this migration have none to restore. NULL passes both the CHECK and
 * the unique index, so those are restored as they were.
 */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('file_chunks', (t) => {
    t.string('category');
  });
  await knex.raw('CREATE INDEX file_chunks_user_category_idx ON file_chunks (user_id, category)');
  await knex.raw('DROP INDEX file_chunks_user_id_idx ON file_chunks');

  await knex.schema.alterTable('user_files', (t) => {
    t.dropColumn('always_include');
    t.dropColumn('tags');
    t.dropColumn('title');
    t.string('category');
  });
  await knex.raw(`
    ALTER TABLE user_files
      ADD CONSTRAINT user_files_category_check
      CHECK (category IN (${DOCUMENT_CATEGORIES.map((c) => `'${c}'`).join(', ')}))
  `);
  await knex.raw('CREATE UNIQUE INDEX user_files_user_category_unique ON user_files (user_id, category)');
  await knex.raw('DROP INDEX user_files_user_id_idx ON user_files');
}
