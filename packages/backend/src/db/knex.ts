import knexLib from 'knex';
import dotenv from 'dotenv';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

// .env lives at the monorepo root, two levels above packages/backend
dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config(); // fallback if running from root directly

const isProd = process.env.NODE_ENV === 'production';

const knex = knexLib({
  client: 'mysql2',
  connection: {
    // 127.0.0.1 rather than localhost: localhost can resolve to ::1, which the
    // database user may not be granted on.
    host: process.env.DB_HOST ?? '127.0.0.1',
    port: parseInt(process.env.DB_PORT ?? '3306', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    charset: 'utf8mb4',
    // Store and read every DATETIME as UTC; the session time zone below makes
    // CURRENT_TIMESTAMP agree with it.
    timezone: 'Z',
    typeCast(field: { type: string; length: number; string(): string | null }, next: () => unknown) {
      // DATE as a plain 'YYYY-MM-DD' string: parsing to a local-midnight Date
      // shifts the day by one in any zone behind/ahead of UTC.
      if (field.type === 'DATE') return field.string();
      // Booleans are TINYINT(1); hand them back as real booleans.
      if (field.type === 'TINY' && field.length === 1) {
        const value = field.string();
        return value === null ? null : value === '1';
      }
      return next();
    },
  },
  pool: {
    min: 2,
    max: 10,
    afterCreate(conn: { query(sql: string, cb: (err: Error | null) => void): void }, done: (err: Error | null, conn: unknown) => void) {
      conn.query("SET time_zone = '+00:00'", (err) => done(err, conn));
    },
  },
  migrations: {
    directory: path.resolve(__dirname, 'migrations'),
    extension: isProd ? 'js' : 'ts',
    loadExtensions: isProd ? ['.js'] : ['.ts'],
  },
});

/**
 * Inserts one row and reads it back. MariaDB has no RETURNING that knex will
 * emit, so the id is generated here instead of by the column default.
 */
export async function insertRow<T = Record<string, unknown>>(
  table: string,
  row: Record<string, unknown>,
  columns: readonly string[] | '*' = '*'
): Promise<T> {
  const id = (row.id as string | undefined) ?? uuidv4();
  await knex(table).insert({ ...row, id });
  const inserted = await knex(table)
    .where({ id })
    .first(columns === '*' ? '*' : [...columns]);
  return inserted as T;
}

export default knex;
