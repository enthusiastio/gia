import { Knex } from 'knex';

/**
 * Each user is on a plan of so many months: 12 for everyone so far, 6 for the
 * shorter one. A plan no longer renews itself when it ends; the admin starts
 * the next one when the user pays for it.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.tinyint('plan_months').unsigned().notNullable().defaultTo(12);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable('users', (t) => {
    t.dropColumn('plan_months');
  });
}
