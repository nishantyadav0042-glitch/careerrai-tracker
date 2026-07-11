import crypto from 'node:crypto';

// Symmetric encryption for the PWA session hand-off payload (access + refresh
// tokens). The key is derived from the service-role secret (already the most
// privileged server secret) so no new env var is required, and the tokens are
// NEVER stored in plaintext at rest. AES-256-GCM gives us authenticated
// encryption — a tampered ciphertext fails to decrypt rather than yielding
// garbage. Server-only (node:crypto): never import from a client component.

function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

export function encryptHandoff(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptHandoff(payload: string): string | null {
  try {
    const [ivB64, tagB64, encB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !encB64) return null;
    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
    decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
    const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null; // tampered / wrong key / corrupt — treat as invalid
  }
}
