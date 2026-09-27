import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { DOCUMENT_CATEGORIES, CATEGORY_LABELS } from '../services/documents/categories';
import {
  deleteUserDocument,
  listUserDocuments,
  replaceUserDocument,
} from '../services/documents/store';

const router = Router();
router.use(requireAuth);

const uploadDir = process.env.UPLOAD_DIR ?? './uploads';
const maxSizeMB = parseInt(process.env.MAX_FILE_SIZE_MB ?? '20', 10);

const documentStorage = multer.diskStorage({
  destination: path.join(uploadDir, 'genetic'),
  filename: (_req, file, cb) => cb(null, `${uuidv4()}${path.extname(file.originalname)}`),
});

const upload = multer({
  storage: documentStorage,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

router.get('/categories', (_req: Request, res: Response) => {
  res.json(DOCUMENT_CATEGORIES.map((value) => ({ value, label: CATEGORY_LABELS[value] })));
});

router.get('/', async (req: Request, res: Response) => {
  res.json(await listUserDocuments(req.user!.id));
});

router.post('/', upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }

  try {
    const record = await replaceUserDocument(
      req.user!.id,
      req.file,
      req.body.category,
      req.body.description
    );
    res.status(201).json(record);
  } catch (err) {
    res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
  }
});

router.delete('/:id', async (req: Request, res: Response) => {
  const deleted = await deleteUserDocument(req.user!.id, String(req.params.id));
  if (!deleted) { res.status(404).json({ error: 'Not found' }); return; }
  res.json({ ok: true });
});

export default router;
