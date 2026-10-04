import { Knex } from 'knex';

/**
 * Admins add users by email before they ever sign in, so a user can exist
 * without a Google account linked yet. The first Google sign-in with that
 * email fills google_id in. The unique index stays: NULLs do not collide.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.string('google_id').nullable().alter();
  });
}

/** Fails while any added user has not signed in yet; delete those first. */
export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.string('google_id').notNullable().alter();
  });
}
