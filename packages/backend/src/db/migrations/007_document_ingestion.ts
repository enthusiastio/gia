import { Knex } from 'knex';

export const DOCUMENT_CATEGORIES = [
  'genotype_calls',
  'derived_phenotype_states',
  'observed_biomarkers',
  'integrated_state_per_axis',
  'personal_protocol',
  'family_history_clinical',
] as const;

export async function up(knex: Knex): Promise<void> {
  // Existing rows predate categories; there are none in practice, but a
  // replace-on-upload model needs every row to carry one.
  await knex('user_files').delete();

  await knex.schema.alterTable('user_files', (t) => {
    t.string('category').notNullable();
    t.text('description');
    t.date('document_date');
    t.string('status').notNullable().defaultTo('pending');
    t.text('error');
    // Whole documents: TEXT's 64 KB would truncate them.
    t.text('extracted_text', 'longtext');
    t.integer('chunk_count').notNullable().defaultTo(0);
    t.datetime('ingested_at', { precision: 6 });
  });

  await knex.raw(`
    ALTER TABLE user_files
      ADD CONSTRAINT user_files_category_check
      CHECK (category IN (${DOCUMENT_CATEGORIES.map((c) => `'${c}'`).join(', ')}))
  `);
  await knex.raw(`
    ALTER TABLE user_files
      ADD CONSTRAINT user_files_status_check
      CHECK (status IN ('pending', 'processing', 'ready', 'failed'))
  `);

  // One document per category per user: re-upload replaces.
  await knex.raw('CREATE UNIQUE INDEX user_files_user_category_unique ON user_files (user_id, category)');

  await knex.schema.createTable('file_chunks', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('(UUID())'));
    t.uuid('file_id').notNullable().references('id').inTable('user_files').onDelete('CASCADE');
    // Denormalised from user_files so every similarity search filters on the
    // tenant boundary without a join.
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('category').notNullable();
    t.integer('chunk_index').notNullable();
    t.text('heading');
    t.text('content', 'mediumtext').notNullable();
    t.specificType('embedding', 'VECTOR(3072)').notNullable();
    t.datetime('created_at', { precision: 6 }).notNullable().defaultTo(knex.fn.now(6));
  });

  // Deliberately no VECTOR INDEX. Every search is filtered to one user's
  // chunks, and an approximate index finds the global nearest neighbours
  // first and filters after, so a user can get fewer matches than exist. An
  // exact scan over one user's chunks through this index is small and correct.
  await knex.raw('CREATE INDEX file_chunks_user_category_idx ON file_chunks (user_id, category)');
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('file_chunks');
  // The unique index doubles as the user_id foreign key's index, so InnoDB
  // refuses to drop it until another index can take that role.
  await knex.raw('CREATE INDEX user_files_user_id_foreign ON user_files (user_id)');
  await knex.raw('DROP INDEX IF EXISTS user_files_user_category_unique ON user_files');
  await knex.raw('ALTER TABLE user_files DROP CONSTRAINT IF EXISTS user_files_category_check');
  await knex.raw('ALTER TABLE user_files DROP CONSTRAINT IF EXISTS user_files_status_check');
  await knex.schema.alterTable('user_files', (t) => {
    t.dropColumn('category');
    t.dropColumn('description');
    t.dropColumn('document_date');
    t.dropColumn('status');
    t.dropColumn('error');
    t.dropColumn('extracted_text');
    t.dropColumn('chunk_count');
    t.dropColumn('ingested_at');
  });
}
