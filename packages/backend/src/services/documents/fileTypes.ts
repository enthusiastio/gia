import path from 'path';
import type { RequestHandler } from 'express';
import multer, { Options } from 'multer';

/** Everything here becomes plain text before chunking; PDF via pdf-parse. */
export const DOCUMENT_EXTENSIONS = ['.txt', '.md', '.markdown', '.csv', '.json', '.pdf'] as const;

export function isPdf(originalName: string, mimeType: string): boolean {
  return mimeType === 'application/pdf' || path.extname(originalName).toLowerCase() === '.pdf';
}

/** Rejects unsupported uploads before they are written to disk. */
export const documentFileFilter: Options['fileFilter'] = (_req, file, cb) => {
  const ext = path.extname(file.originalname).toLowerCase();
  if ((DOCUMENT_EXTENSIONS as readonly string[]).includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file type "${ext || file.originalname}". Allowed: ${DOCUMENT_EXTENSIONS.join(', ')}`));
  }
};

/**
 * Runs a multer middleware and answers its failures as JSON, so a rejected
 * type or an oversized file reaches the admin as a readable error rather than
 * Express's default HTML 500 page.
 */
export function withUploadErrors(middleware: RequestHandler, maxSizeMB: number): RequestHandler {
  return (req, res, next) => {
    middleware(req, res, (err?: unknown) => {
      if (err instanceof multer.MulterError) {
        res.status(413).json({
          error: err.code === 'LIMIT_FILE_SIZE' ? `File too large (max ${maxSizeMB}MB)` : err.message,
        });
        return;
      }
      if (err) {
        res.status(400).json({ error: err instanceof Error ? err.message : String(err) });
        return;
      }
      next();
    });
  };
}
