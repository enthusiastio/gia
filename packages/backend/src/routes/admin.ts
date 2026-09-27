import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/admin';
import knex from '../db/knex';
import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from '../services/documents/categories';
import {
  deleteUserDocument,
  getUserDocumentBlob,
  listUserDocuments,
  reingestUserDocument,
  replaceUserDocument,
  updateUserDocument,
} from '../services/documents/store';
import { deleteUserAccount } from '../services/users';

const router = Router();
router.use(requireAuth, requireAdmin);

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';
const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB ?? '20', 10);

const geneticStorage = multer.diskStorage({
  destination: path.join(uploadDir, 'genetic'),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});
const upload = multer({ storage: geneticStorage, limits: { fileSize: maxSizeMB * 1024 * 1024 } });

router.get('/users', async (_req: Request, res: Response) => {
  const users = await knex('users')
    .leftJoin('user_configs', 'users.id', 'user_configs.user_id')
    .select(
      'users.id', 'users.email', 'users.name', 'users.avatar_url',
      'users.is_admin', 'users.created_at',
      'user_configs.model', 'user_configs.model_provider', 'user_configs.system_prompt'
    )
    .orderBy('users.created_at', 'desc');

  const counts = await knex('conversations')
    .select('user_id')
    .count('id as count')
    .groupBy('user_id');

  const countMap = Object.fromEntries(counts.map((c) => [c.user_id, Number(c.count)]));
  res.json(users.map((u) => ({ ...u, conversation_count: countMap[u.id] ?? 0 })));
});

router.get('/users/:id', async (req: Request, res: Response) => {
  const [user] = await knex('users')
    .leftJoin('user_configs', 'users.id', 'user_configs.user_id')
    .where('users.id', req.params.id)
    .select('users.*', 'user_configs.model', 'user_configs.model_provider', 'user_configs.system_prompt');
  if (!user) { res.status(404).json({ error: 'Not found' }); return; }

  const files = await listUserDocuments(String(req.params.id));

  res.json({ ...user, files });
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

router.get('/document-categories', (_req: Request, res: Response) => {
  res.json(DOCUMENT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })));
});

router.post('/users/:id/files', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }

  try {
    const record = await replaceUserDocument(
      String(req.params.id),
      req.file,
      req.body.category,
      req.body.description
    );
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.patch('/users/:id/files/:fileId', async (req: Request, res: Response) => {
  const { description, document_date } = req.body;
  const record = await updateUserDocument(String(req.params.id), String(req.params.fileId), { description, document_date });
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
