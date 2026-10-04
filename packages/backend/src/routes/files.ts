import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import { requireAuth } from '../middleware/auth';
import { v4 as uuidv4 } from 'uuid';
import { documentFileFilter, withUploadErrors } from '../services/documents/fileTypes';
import {
  addUserDocument,
  deleteUserDocument,
  listUserDocuments,
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
  fileFilter: documentFileFilter,
  limits: { fileSize: maxSizeMB * 1024 * 1024 },
});

router.get('/', async (req: Request, res: Response) => {
  res.json(await listUserDocuments(req.user!.id));
});

router.post('/', withUploadErrors(upload.single('file'), maxSizeMB), async (req: Request, res: Response) => {
  if (!req.file) { res.status(400).json({ error: 'No file' }); return; }

  try {
    const record = await addUserDocument(req.user!.id, req.file, {
      title: req.body.title,
      description: req.body.description,
    });
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
