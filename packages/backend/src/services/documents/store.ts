import fs from 'fs';
import path from 'path';
import knex, { insertRow } from '../../db/knex';
import { enqueueIngestion } from './ingest';
import { normaliseTags } from './tags';

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';

export const FILE_COLUMNS = [
  'id',
  'original_name',
  'mime_type',
  'size',
  'title',
  'description',
  'tags',
  'always_include',
  'document_date',
  'status',
  'error',
  'chunk_count',
  'ingested_at',
  'created_at',
] as const;

export function removeBlob(storagePath: string): void {
  try {
    fs.unlinkSync(path.join(uploadDir, storagePath));
  } catch {
    /* already gone */
  }
}

/**
 * Stores an upload as a new document for the user and queues it for
 * ingestion. Title and description are optional: ingestion writes whatever
 * the uploader left empty.
 */
export async function addUserDocument(
  userId: string,
  file: Express.Multer.File,
  meta: { title?: string; description?: string } = {}
) {
  const record = await insertRow<{ id: string }>(
    'user_files',
    {
      user_id: userId,
      original_name: file.originalname,
      storage_path: path.relative(uploadDir, file.path),
      mime_type: file.mimetype,
      size: file.size,
      title: meta.title?.trim() || null,
      description: meta.description?.trim() || null,
      status: 'pending',
    },
    FILE_COLUMNS
  );

  enqueueIngestion(record.id);
  return record;
}

export async function deleteUserDocument(userId: string, fileId: string): Promise<boolean> {
  const file = await knex('user_files').where({ id: fileId, user_id: userId }).first();
  if (!file) return false;

  await knex('user_files').where({ id: fileId }).delete();
  removeBlob(file.storage_path);
  return true;
}

/**
 * Resolves a user's document to the blob on disk. Chunks are lossy by design
 * (headings hoisted out, table headers repeated, 500-char overlap), so the
 * original upload is the only faithful thing to hand back for re-import.
 */
export async function getUserDocumentBlob(userId: string, fileId: string) {
  const file = await knex('user_files').where({ id: fileId, user_id: userId }).first();
  if (!file) return null;

  const fullPath = path.join(uploadDir, file.storage_path);
  if (!fs.existsSync(fullPath)) return null;

  return { path: fullPath, name: file.original_name, mimeType: file.mime_type };
}

export async function listUserDocuments(userId: string) {
  return knex('user_files')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .select(FILE_COLUMNS as unknown as string[]);
}

/** Re-runs extraction, description and embedding against the stored blob. */
export async function reingestUserDocument(userId: string, fileId: string): Promise<boolean> {
  const file = await knex('user_files').where({ id: fileId, user_id: userId }).first();
  if (!file) return false;

  await knex('user_files').where({ id: fileId }).update({ status: 'pending', error: null });
  enqueueIngestion(fileId);
  return true;
}

export interface DocumentPatch {
  title?: string | null;
  description?: string | null;
  tags?: string[] | null;
  document_date?: string | null;
  always_include?: boolean;
}

/**
 * Admin edits to the metadata. Clearing the title, description or tags makes
 * the next ingestion regenerate them rather than leaving the field empty.
 */
export async function updateUserDocument(userId: string, fileId: string, patch: DocumentPatch) {
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title?.trim() || null;
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.tags !== undefined) {
    const tags = normaliseTags(patch.tags);
    update.tags = tags.length > 0 ? JSON.stringify(tags) : null;
  }
  if (patch.document_date !== undefined) update.document_date = patch.document_date || null;
  if (patch.always_include !== undefined) update.always_include = Boolean(patch.always_include);
  if (Object.keys(update).length === 0) return null;

  const updated = await knex('user_files').where({ id: fileId, user_id: userId }).update(update);
  if (!updated) return null;
  return knex('user_files')
    .where({ id: fileId })
    .first(FILE_COLUMNS as unknown as string[]);
}
