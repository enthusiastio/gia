import crypto from 'crypto';

/**
 * Encrypts secrets stored in the database (provider API keys), so a database
 * dump or backup alone does not leak them. The key comes from the server's
 * environment, never from the database.
 *
 * SETTINGS_SECRET is preferred; JWT_SECRET is the fallback so existing
 * installs work unchanged. Changing whichever is in use makes stored keys
 * unreadable, and they have to be entered again.
 */
function key(): Buffer {
  const secret = process.env.SETTINGS_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('SETTINGS_SECRET or JWT_SECRET must be set to store API keys');
  return crypto.createHash('sha256').update(`gia-settings:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

/** null when the value cannot be decrypted, e.g. after the secret changed. */
export function decryptSecret(stored: string): string | null {
  try {
    const [version, iv, tag, data] = stored.split(':');
    if (version !== 'v1') return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64'));
    decipher.setAuthTag(Buffer.from(tag, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
  } catch {
    return null;
  }
}
