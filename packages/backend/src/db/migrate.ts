import knex from './knex';
import { logger } from '../logger';

async function run() {
  const action = process.argv[2];
  if (action === 'rollback') {
    await knex.migrate.rollback({ directory: 'src/db/migrations' });
    logger.info('Rollback complete');
  } else {
    await knex.migrate.latest({ directory: 'src/db/migrations' });
    logger.info('Migrations complete');
  }
  await knex.destroy();
}

run().catch((err) => {
  logger.error(err);
  process.exit(1);
});
