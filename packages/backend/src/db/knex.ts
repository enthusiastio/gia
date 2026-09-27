import knexLib from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import pgTypes from 'pg';

// DATE (oid 1082) as a plain 'YYYY-MM-DD' string: node-pg's default parse to a
// local-midnight Date shifts the day by one in any zone behind/ahead of UTC.
pgTypes.types.setTypeParser(1082, (value: string) => value);

// .env lives at the monorepo root, two levels above packages/backend
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config(); // fallback if running from root directly

const isProd = process.env.NODE_ENV === 'production';

const knex = knexLib({
  client: 'pg',
  connection: process.env.DATABASE_URL,
  pool: { min: 2, max: 10 },
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    extension: isProd ? 'js' : 'ts',
    loadExtensions: isProd ? ['.js'] : ['.ts'],
  },
});

export default knex;
