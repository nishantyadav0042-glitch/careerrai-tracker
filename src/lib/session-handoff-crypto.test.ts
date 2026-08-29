import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'node:crypto';
import { encryptHandoff, decryptHandoff } from './session-handoff-crypto';

// ── THIS MODULE CARRIES A STUDENT'S SESSION, AND HAD NO TESTS ───────────────
//
// encryptHandoff wraps the access AND refresh token for the PWA install
// hand-off. It shipped untested, which is how `createDecipheriv` came to run
// without an authTagLength for the module's whole life: nothing exercised a
// forged payload, so nothing noticed that a forged payload got a cheaper ride
// than the design assumed.

beforeAll(() => {
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key-for-unit-tests-only';
});

const TAG_BYTES = 16;
const IV_BYTES = 12;
const parts = (p: string) => p.split('.');

describe('a hand-off survives the round trip', () => {
  it('decrypts back to exactly what went in', () => {
    const secret = JSON.stringify({ access_token: 'a'.repeat(200), refresh_token: 'r'.repeat(60) });
    expect(decryptHandoff(encryptHandoff(secret))).toBe(secret);
  });

  it('the plaintext never appears in the payload', () => {
    const payload = encryptHandoff('the-refresh-token-nobody-may-read');
    expect(payload).not.toContain('the-refresh-token-nobody-may-read');
  });

  it('two encryptions of the same text differ — the nonce is fresh each time', () => {
    // A repeated nonce under one key destroys GCM's guarantees outright.
    const seen = new Set(Array.from({ length: 50 }, () => parts(encryptHandoff('same'))[0]));
    expect(seen.size).toBe(50);
  });

  it('the wire format is iv.tag.ciphertext at the sizes GCM is defined for', () => {
    const [ivB64, tagB64] = parts(encryptHandoff('x'));
    expect(Buffer.from(ivB64, 'base64')).toHaveLength(IV_BYTES);
    expect(Buffer.from(tagB64, 'base64')).toHaveLength(TAG_BYTES);
  });
});

describe('a forged payload is refused', () => {
  it('a flipped ciphertext bit does not decrypt', () => {
    const [iv, tag, enc] = parts(encryptHandoff('secret'));
    const bytes = Buffer.from(enc, 'base64');
    bytes[0] ^= 0xff;
    expect(decryptHandoff(`${iv}.${tag}.${bytes.toString('base64')}`)).toBeNull();
  });

  it('a flipped tag bit does not decrypt', () => {
    const [iv, tag, enc] = parts(encryptHandoff('secret'));
    const bytes = Buffer.from(tag, 'base64');
    bytes[0] ^= 0xff;
    expect(decryptHandoff(`${iv}.${bytes.toString('base64')}.${enc}`)).toBeNull();
  });

  // ── THE FINDING THIS FILE EXISTS FOR ──────────────────────────────────────
  //
  // Without authTagLength, Node accepts a SHORT tag, and GCM's forgery
  // resistance is exactly the length of the tag actually verified: a 4-byte
  // tag is 2^-32 per attempt instead of 2^-128. The tag travels inside the
  // payload, so whoever supplies the payload chooses its length.
  it('a TRUNCATED tag is refused, not verified at reduced strength', () => {
    const [iv, tag, enc] = parts(encryptHandoff('secret'));
    const full = Buffer.from(tag, 'base64');
    for (const shorter of [4, 8, 12, 15]) {
      const cut = full.subarray(0, shorter).toString('base64');
      expect(decryptHandoff(`${iv}.${cut}.${enc}`), `${shorter}-byte tag was accepted`).toBeNull();
    }
  });

  it('an over-long tag is refused too', () => {
    const [iv, tag, enc] = parts(encryptHandoff('secret'));
    const padded = Buffer.concat([Buffer.from(tag, 'base64'), Buffer.alloc(4)]).toString('base64');
    expect(decryptHandoff(`${iv}.${padded}.${enc}`)).toBeNull();
  });

  it('a wrong-length nonce is refused', () => {
    const [, tag, enc] = parts(encryptHandoff('secret'));
    for (const n of [0, 8, 11, 13, 16]) {
      const iv = crypto.randomBytes(n).toString('base64');
      expect(decryptHandoff(`${iv}.${tag}.${enc}`), `${n}-byte IV was accepted`).toBeNull();
    }
  });

  it('a payload encrypted under a different key does not decrypt', () => {
    const payload = encryptHandoff('secret');
    const original = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'a-completely-different-service-role-key';
    try {
      expect(decryptHandoff(payload)).toBeNull();
    } finally {
      process.env.SUPABASE_SERVICE_ROLE_KEY = original;
    }
  });

  it('malformed input returns null rather than throwing', () => {
    for (const junk of ['', '.', 'a.b', 'a.b.c', 'not-a-payload', '..', 'a.b.c.d']) {
      expect(() => decryptHandoff(junk)).not.toThrow();
      expect(decryptHandoff(junk)).toBeNull();
    }
  });
});
