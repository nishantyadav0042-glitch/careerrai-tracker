import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { describeSbCookies, sbRemovalNames } from './auth-observation';

// ── Track B instrumentation: the privacy rule is proven, not promised ───────
//
// The founder's prohibition: the observation payloads may NEVER carry cookie
// values, tokens, the Cookie header, or user identifiers. These tests plant a
// secret where a bug would leak it and assert it cannot reach the output.

const SECRET = 'base64-SUPER_SECRET_REFRESH_TOKEN_zx81';

describe('describeSbCookies — names and lengths only', () => {
  it('reports every sb-* cookie by name and byte length', () => {
    const out = describeSbCookies([
      { name: 'sb-pob-auth-token.0', value: 'a'.repeat(3180) },
      { name: 'sb-pob-auth-token.1', value: 'b'.repeat(912) },
      { name: 'user_role', value: 'student' },
    ]);
    expect(out.names).toEqual(['sb-pob-auth-token.0', 'sb-pob-auth-token.1']);
    expect(out.bytes).toEqual([3180, 912]);
  });

  it('an empty jar is an empty (but present) answer — absence IS the finding', () => {
    const out = describeSbCookies([{ name: 'user_role', value: 'student' }]);
    expect(out.names).toEqual([]);
    expect(out.bytes).toEqual([]);
  });

  it('a planted secret value can never reach the serialized payload', () => {
    const out = describeSbCookies([
      { name: 'sb-pob-auth-token', value: SECRET },
      { name: 'other', value: SECRET },
    ]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(JSON.stringify(out)).not.toContain(SECRET.slice(7, 20));
  });
});

describe('sbRemovalNames — the deletion signature, values never included', () => {
  it('flags sb-* cookies being expired (maxAge 0) or emptied', () => {
    expect(sbRemovalNames([
      { name: 'sb-pob-auth-token.0', value: '', maxAge: 0 },
      { name: 'sb-pob-auth-token.1', value: '', maxAge: 0 },
    ])).toEqual(['sb-pob-auth-token.0', 'sb-pob-auth-token.1']);
  });

  it('a normal (non-removal) auth-cookie write is NOT flagged', () => {
    expect(sbRemovalNames([
      { name: 'sb-pob-auth-token.0', value: 'fresh-rotation-payload', maxAge: 34560000 },
    ])).toEqual([]);
  });

  it('non-auth cookie removals are never reported', () => {
    expect(sbRemovalNames([
      { name: 'cr_store', value: '', maxAge: 0 },
      { name: 'user_role', value: '', maxAge: 0 },
    ])).toEqual([]);
  });

  it('a planted secret value can never reach the output', () => {
    const out = sbRemovalNames([{ name: 'sb-pob-auth-token', value: SECRET, maxAge: 0 }]);
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });
});

describe('the middleware wiring stays observation-only', () => {
  const proxy = readFileSync('src/proxy.ts', 'utf8');

  it('both observation lines exist and build their payloads ONLY from the safe helpers', () => {
    expect(proxy).toContain("console.error('[auth-loss-observation]'");
    expect(proxy).toContain("console.error('[auth-cookie-removal]'");
    expect(proxy).toContain('describeSbCookies(request.cookies.getAll())');
    expect(proxy).toContain('sbRemovalNames(');
  });

  it('the loss/removal payloads never serialize a cookie value or the Cookie header', () => {
    // The idea: within the two JSON.stringify payloads, no `.value` access and
    // no raw Cookie-header read may appear.
    for (const marker of ['[auth-loss-observation]', '[auth-cookie-removal]']) {
      const at = proxy.indexOf(marker);
      expect(at).toBeGreaterThan(-1);
      const payload = proxy.slice(at, proxy.indexOf(');', at));
      expect(payload).not.toContain('.value');
      expect(payload).not.toMatch(/headers\.get\(['"]cookie/i);
      expect(payload).not.toMatch(/authorization/i);
    }
  });

  it('observation happens on the no-user branch, before the redirect decision', () => {
    const loss = proxy.indexOf('[auth-loss-observation]');
    const redirect = proxy.indexOf('const storeLaunch');
    expect(loss).toBeGreaterThan(-1);
    expect(loss).toBeLessThan(redirect);
  });
});
