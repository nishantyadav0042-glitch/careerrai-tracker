import crypto from 'node:crypto';

// Symmetric encryption for the PWA session hand-off payload (access + refresh
// tokens). The key is derived from the service-role secret (already the most
// privileged server secret) so no new env var is required, and the tokens are
// NEVER stored in plaintext at rest. AES-256-GCM gives us authenticated
// encryption — a tampered ciphertext fails to decrypt rather than yielding
// garbage. Server-only (node:crypto): never import from a client component.

/**
 * ── THE LENGTHS ARE PART OF THE ALGORITHM, NOT DEFAULTS TO INHERIT ──────────
 *
 * 29 Aug 2026, found by Semgrep on main (`gcm-no-tag-length`) after the check
 * had been red long enough that nobody read it.
 *
 * `setAuthTag` accepts a SHORT tag. GCM's forgery resistance is exactly the
 * length of the tag it verifies against, so a 4-byte tag is 2^-32 per attempt
 * rather than 2^-128 — and the tag arrives inside the payload, so whoever
 * supplies the payload chooses it. The code looked authenticated, and was,
 * against whatever strength the attacker picked.
 *
 * Node fixes this two ways and this uses both: `authTagLength` tells the
 * decipher what to require, and the explicit length check refuses a malformed
 * payload before any crypto runs. The IV is checked for the same reason —
 * GCM's security argument assumes a 96-bit nonce, and it comes from the same
 * attacker-supplied string.
 */
const TAG_BYTES = 16;   // 128-bit authentication tag
const IV_BYTES  = 12;   // 96-bit nonce, the size GCM is defined for

function key(): Buffer {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) throw new Error('SUPABASE_SERVICE_ROLE_KEY missing');
  return crypto.createHash('sha256').update(secret).digest(); // 32 bytes
}

export function encryptHandoff(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv, { authTagLength: TAG_BYTES });
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64')}.${tag.toString('base64')}.${enc.toString('base64')}`;
}

export function decryptHandoff(payload: string): string | null {
  try {
    const [ivB64, tagB64, encB64] = payload.split('.');
    if (!ivB64 || !tagB64 || !encB64) return null;

    // Refuse a wrong-sized nonce or tag outright. Base64 is permissive — it
    // will happily decode a 4-byte "tag" — so this is the only place the
    // shape is established, and it runs before the key is even touched.
    const iv = Buffer.from(ivB64, 'base64');
    const tag = Buffer.from(tagB64, 'base64');
    if (iv.length !== IV_BYTES || tag.length !== TAG_BYTES) return null;

    const decipher = crypto.createDecipheriv('aes-256-gcm', key(), iv, { authTagLength: TAG_BYTES });
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(Buffer.from(encB64, 'base64')), decipher.final()]);
    return dec.toString('utf8');
  } catch {
    return null; // tampered / wrong key / corrupt — treat as invalid
  }
}
