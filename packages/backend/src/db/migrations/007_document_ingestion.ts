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
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');

  // Existing rows predate categories; there are none in practice, but a
  // replace-on-upload model needs every row to carry one.
  await knex('user_files').delete();

  await knex.schema.alterTable('user_files', (t) => {
    t.string('category').notNullable();
    t.text('description');
    t.date('document_date');
    t.string('status').notNullable().defaultTo('pending');
    t.text('error');
    t.text('extracted_text');
    t.integer('chunk_count').notNullable().defaultTo(0);
    t.timestamp('ingested_at');
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
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('file_id').notNullable().references('id').inTable('user_files').onDelete('CASCADE');
    // Denormalised from user_files so every similarity search filters on the
    // tenant boundary without a join.
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('category').notNullable();
    t.integer('chunk_index').notNullable();
    t.text('heading');
    t.text('content').notNullable();
    t.timestamp('created_at').notNullable().defaultTo(knex.fn.now());
  });

  await knex.raw('ALTER TABLE file_chunks ADD COLUMN embedding vector(3072)');
  await knex.raw('CREATE INDEX file_chunks_user_category_idx ON file_chunks (user_id, category)');

  // HNSW caps at 2000 dimensions for `vector`, so index the halfvec cast:
  // half precision costs negligible recall and supports up to 4000 dims.
  await knex.raw(`
    CREATE INDEX file_chunks_embedding_idx ON file_chunks
    USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops)
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists('file_chunks');
  await knex.raw('DROP INDEX IF EXISTS user_files_user_category_unique');
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
