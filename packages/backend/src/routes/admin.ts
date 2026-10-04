import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import knex, { insertRow } from '../db/knex';
import { v4 as uuidv4 } from 'uuid';
import { documentFileFilter, withUploadErrors } from '../services/documents/fileTypes';
import {
  addUserDocument,
  deleteUserDocument,
  getUserDocumentBlob,
  listUserDocuments,
  reingestUserDocument,
  updateUserDocument,
} from '../services/documents/store';
import { deleteUserAccount } from '../services/users';

const router = Router();
router.use(requireAuth, requireAdmin);

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';
const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB ?? '20', 10);

const documentStorage = multer.diskStorage({
  destination: path.join(uploadDir, 'genetic'),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({
  storage: documentStorage,
  fileFilter: documentFileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

/** Replaces google_id, which the admin UI has no use for, with whether it is set. */
function withSignInState<T extends { google_id?: string | null }>(user: T) {
  const { google_id, ...rest } = user;
  return { ...rest, has_signed_in: Boolean(google_id) };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Adds a user before they ever sign in, so their documents can be uploaded
 * in advance. Their first Google sign-in with this email links the account.
 */
router.post('/users', async (req: Request, res: Response) => {
  const email = String(req.body.email ?? '').trim().toLowerCase();
  if (!EMAIL_PATTERN.test(email)) {
    res.status(400).json({ error: 'Enter a valid email address' });
    return;
  }

  const existing = await knex('users').where({ email }).first('id');
  if (existing) {
    res.status(409).json({ error: `${email} already has an account` });
    return;
  }

  const name = String(req.body.name ?? '').trim() || email.split('@')[0];
  const user = await insertRow<{ google_id: string | null }>('users', {
    email,
    name,
    google_id: null,
    is_admin: false,
  });
  res.status(201).json({ ...withSignInState(user), conversation_count: 0 });
});

router.get('/users', async (_req: Request, res: Response) => {
  const users = await knex('users')
    .leftJoin('user_configs', 'users.id', 'user_configs.user_id')
    .select(
      'users.id', 'users.email', 'users.name', 'users.avatar_url',
      'users.is_admin', 'users.created_at', 'users.google_id',
      'user_configs.model', 'user_configs.model_provider', 'user_configs.system_prompt'
    )
    // Oldest first, so a newly added user appears at the bottom, right where
    // the admin panel's "Add user" control sits.
    .orderBy('users.created_at', 'asc');

  const counts = await knex('conversations')
    .select('user_id')
    .count('id as count')
    .groupBy('user_id');

  const countMap = Object.fromEntries(counts.map((c) => [c.user_id, Number(c.count)]));
  res.json(users.map((u) => ({ ...withSignInState(u), conversation_count: countMap[u.id] ?? 0 })));
});

router.get('/users/:id', async (req: Request, res: Response) => {
  const [user] = await knex('users')
    .leftJoin('user_configs', 'users.id', 'user_configs.user_id')
    .where('users.id', req.params.id)
    .select('users.*', 'user_configs.model', 'user_configs.model_provider', 'user_configs.system_prompt');
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }

  const files = await listUserDocuments(String(req.params.id));

  res.json({ ...withSignInState(user), files });
});

router.put('/users/:id/config', async (req: Request, res: Response) => {
  const { model, model_provider, system_prompt, is_admin } = req.body;

  if (is_admin !== undefined) {
    await knex('users').where({ id: req.params.id }).update({ is_admin: Boolean(is_admin) });
  }

  const [existing] = await knex('user_configs').where({ user_id: req.params.id });
  if (existing) {
    await knex('user_configs').where({ user_id: req.params.id }).update({ model, model_provider, system_prompt, updated_at: knex.fn.now() });
  } else {
    await knex('user_configs').insert({ user_id: req.params.id, model, model_provider, system_prompt });
  }
  res.json({ ok: true });
});

router.delete('/users/:id', async (req: Request, res: Response) => {
  if (req.params.id === req.user!.id) {
    res.status(400).json({ error: 'You cannot delete your own account' });
    return;
  }

  const deleted = await deleteUserAccount(String(req.params.id));
  if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

router.post('/users/:id/files', withUploadErrors(upload.single('file'), maxSizeMB), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }

  try {
    const record = await addUserDocument(String(req.params.id), req.file, {
      title: req.body.title,
      description: req.body.description,
    });
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.patch('/users/:id/files/:fileId', async (req: Request, res: Response) => {
  const { title, description, tags, document_date, always_include } = req.body;
  const record = await updateUserDocument(String(req.params.id), String(req.params.fileId), {
    title,
    description,
    tags,
    document_date,
    always_include,
  });
  if (!record) { res.status(404).json({ error: 'Not found' }); return; }
  res.json(record);
});

router.get('/users/:id/files/:fileId/download', async (req: Request, res: Response) => {
  const blob = await getUserDocumentBlob(String(req.params.id), String(req.params.fileId));
  if (!blob) { res.status(404).json({ error: 'Not found' }); return; }

  res.type(blob.mimeType);
  res.download(blob.path, blob.name);
});

router.post('/users/:id/files/:fileId/reingest', async (req: Request, res: Response) => {
  const ok = await reingestUserDocument(String(req.params.id), String(req.params.fileId));
  if (!ok) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

router.delete('/users/:id/files/:fileId', async (req: Request, res: Response) => {
  const deleted = await deleteUserDocument(String(req.params.id), String(req.params.fileId));
  if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

export default router;
