import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

export interface AuthUser {
  id: string;
  email: string;
  is_admin: boolean;
}

declare global {
  namespace Express {
    // Merge with passport's User interface
    interface User extends AuthUser {}
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = req.cookies?.token || req.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as AuthUser;
    (req as Request & { user: AuthUser }).user = payload;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}
