import knex from '../db/knex';
import { logger } from '../logger';
import { removeBlob } from './documents/store';

/**
 * Deletes a user and everything they own. Configs, files, conversations,
 * messages and chunks all cascade from the user row; the document blobs on
 * disk do not, so their paths are read first and unlinked afterwards.
 */
export async function deleteUserAccount(userId: string): Promise<boolean> {
  const files = await knex('user_files').where({ user_id: userId }).select('storage_path');

  const deleted = await knex('users').where({ id: userId }).delete();
  if (!deleted) return false;

  files.forEach((f) => removeBlob(f.storage_path));
  logger.info('[admin] deleted user', userId, `${files.length} document(s)`);
  return true;
}
