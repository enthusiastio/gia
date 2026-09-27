import fs from 'fs';
import path from 'path';
import knex from '../../db/knex';
import { isDocumentCategory } from './categories';
import { enqueueIngestion } from './ingest';

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';

export const FILE_COLUMNS = [
  'id',
  'original_name',
  'mime_type',
  'size',
  'category',
  'description',
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
 * Stores an upload as the user's document for that category, replacing any
 * existing one (chunks cascade), then queues it for ingestion.
 */
export async function replaceUserDocument(
  userId: string,
  file: Express.Multer.File,
  category: string,
  description?: string
) {
  if (!isDocumentCategory(category)) {
    removeBlob(path.relative(uploadDir, file.path));
    throw new Error(`Unknown category: ${category}`);
  }

  const previous = await knex('user_files').where({ user_id: userId, category }).first();
  if (previous) {
    await knex('user_files').where({ id: previous.id }).delete();
    removeBlob(previous.storage_path);
  }

  const [record] = await knex('user_files')
    .insert({
      user_id: userId,
      original_name: file.originalname,
      storage_path: path.relative(uploadDir, file.path),
      mime_type: file.mimetype,
      size: file.size,
      category,
      description: description?.trim() || null,
      status: 'pending',
    })
    .returning(FILE_COLUMNS as unknown as string[]);

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

/**
 * Admin edits to the metadata. Clearing the description makes the next
 * ingestion regenerate it rather than leaving the field empty.
 */
export async function updateUserDocument(
  userId: string,
  fileId: string,
  patch: { description?: string | null; document_date?: string | null }
) {
  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) update.description = patch.description?.trim() || null;
  if (patch.document_date !== undefined) update.document_date = patch.document_date || null;
  if (Object.keys(update).length === 0) return null;

  const [record] = await knex('user_files')
    .where({ id: fileId, user_id: userId })
    .update(update)
    .returning(FILE_COLUMNS as unknown as string[]);
  return record ?? null;
}
