import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';

/**
 * ── APNs: THE SECOND TRANSPORT, PROVEN AT EVERY SEAM (task #78) ─────────────
 *
 * The App Store build is a WKWebView wrapper, and Apple bars Web Push from
 * embedded web views — so its 211 students are reachable only via native
 * APNs. These tests pin the server half of that wire:
 *
 *   registration (ownership, idempotency, account switching)
 *   routing (an APNs endpoint takes the APNs wire and ONLY that wire)
 *   failure semantics (a dead token kills one endpoint; OUR credential
 *     problems kill nothing)
 *   secrecy (no key material in the repo or the client bundle)
 *
 * The web-push path and the notification policy layer must come out of this
 * change byte-identical in behaviour — several tests below exist purely to
 * prove nothing moved.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Transport mocks: the two wires are observed, never actually dialed ──────
const webpushSend = vi.fn(async (...args: unknown[]) => { void args; });
vi.mock('web-push', () => ({
  default: { setVapidDetails: vi.fn(), sendNotification: (...a: unknown[]) => webpushSend(...a) },
}));
const apnsSend = vi.fn(async (...args: unknown[]): Promise<{ ok: boolean; reason?: string; terminal?: boolean }> => { void args; return { ok: true }; });
vi.mock('@/lib/apns', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./apns')>()),
  sendApnsToToken: (...a: unknown[]) => apnsSend(...a),
}));
vi.mock('@/lib/server-config', () => ({
  getServerConfig: vi.fn(async (key: string) => (key.startsWith('VAPID') ? 'configured' : null)),
}));
vi.mock('@/lib/consent-history', () => ({ logConsentEvent: vi.fn(async () => {}) }));
vi.mock('@/lib/email', () => ({ sendAdminAlert: vi.fn(async () => {}) }));

let fakeAdmin: any;
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => fakeAdmin }));

const { registerApnsEndpoint } = await import('./notification-endpoints');
const { sendPushToUser } = await import('./push');
const { classifyApnsResponse, isValidApnsToken } = await import('./apns');

type Row = Record<string, any>;

/** Same stateful Postgres-shaped fake the #79 suite established, plus the
 *  operators this wire needs (neq, not, order, limit, count-free selects). */
function db(seed: Record<string, Row[]>) {
  const t: Record<string, Row[]> = Object.fromEntries(
    Object.entries(seed).map(([k, v]) => [k, v.map((r) => ({ ...r }))]),
  );
  let inserted = 0;
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'upsert' | 'insert' = 'select';
    let patch: Row = {};
    let incoming: Row = {};
    let conflict: string[] = [];
    const matched = () => (t[table] ??= []).filter((r) => filters.every((f) => f(r)));
    const run = () => {
      if (mode === 'insert') { t[table].push({ ...incoming }); return { data: [{ ...incoming }], error: null }; }
      if (mode === 'update') {
        const hit = matched(); hit.forEach((r) => Object.assign(r, patch));
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (mode === 'upsert') {
        const clash = t[table].find((r) => conflict.every((c) => r[c] === incoming[c]));
        if (clash) { Object.assign(clash, incoming); return { data: [{ ...clash }], error: null }; }
        t[table].push({ ...incoming }); return { data: [{ ...incoming }], error: null };
      }
      return { data: matched().map((r) => ({ ...r })), error: null };
    };
    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      neq: (c: string, v: unknown) => { filters.push((r) => r[c] !== v); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      not: (c: string, _op: string, v: unknown) => { filters.push((r) => (r[c] ?? null) !== v); return q; },
      gte: (c: string, v: unknown) => { filters.push((r) => String(r[c]) >= String(v)); return q; },
      order: () => q,
      limit: () => q,
      insert: (r: Row) => { mode = 'insert'; incoming = { id: `gen-${++inserted}`, ...r }; return q; },
      update: (p: Row) => { mode = 'update'; patch = p; return q; },
      upsert: (r: Row, o?: { onConflict?: string }) => {
        mode = 'upsert'; incoming = r;
        conflict = (o?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        return q;
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      single: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return q;
  };
  return { t, admin: { from } };
}

const STUDENT_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const STUDENT_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const TOKEN_1 = 'a'.repeat(64);
const TOKEN_2 = 'b'.repeat(64);
const PAYLOAD = { title: 'T', body: 'B', url: '/x', notifId: '11111111-1111-4111-1111-111111111111' };

const liveApnsRows = (t: Record<string, Row[]>) =>
  t.notification_endpoints.filter((r) => r.provider === 'apns' && (r.revoked_at ?? null) === null);

beforeEach(() => { webpushSend.mockClear(); apnsSend.mockClear(); apnsSend.mockResolvedValue({ ok: true }); });

// ── A/B/C/D · REGISTRATION ──────────────────────────────────────────────────

describe('A · registering a token creates exactly the right row', () => {
  it('binds provider apns + the token to THIS student', async () => {
    const { t, admin } = db({ notification_endpoints: [] });
    await registerApnsEndpoint(admin, STUDENT_A, TOKEN_1);

    expect(liveApnsRows(t)).toHaveLength(1);
    const row = liveApnsRows(t)[0];
    expect(row.student_id).toBe(STUDENT_A);
    expect(row.device_token).toBe(TOKEN_1);
    expect(row.platform).toBe('ios');
    expect(row.app_context).toBe('ios_app');
  });
});

describe('B · duplicate registration is idempotent', () => {
  it('the same phone registering twice is one row, refreshed', async () => {
    const { t, admin } = db({ notification_endpoints: [] });
    await registerApnsEndpoint(admin, STUDENT_A, TOKEN_1);
    const first = liveApnsRows(t)[0];
    first.last_seen_at = 'earlier';

    await registerApnsEndpoint(admin, STUDENT_A, TOKEN_1);

    expect(liveApnsRows(t), 'no second row for the same (student, token)').toHaveLength(1);
    expect(liveApnsRows(t)[0].last_seen_at, 'the re-register must refresh the row').not.toBe('earlier');
  });
});

describe('C · one student, two iPhones', () => {
  it('two tokens are two live rows on the same student', async () => {
    const { t, admin } = db({ notification_endpoints: [] });
    await registerApnsEndpoint(admin, STUDENT_A, TOKEN_1);
    await registerApnsEndpoint(admin, STUDENT_A, TOKEN_2);

    expect(liveApnsRows(t)).toHaveLength(2);
    expect(new Set(liveApnsRows(t).map((r) => r.student_id))).toEqual(new Set([STUDENT_A]));
  });
});

describe('D/J · a physical phone belongs to at most one student', () => {
  it('student B registering A’s token revokes A’s row and creates B’s', async () => {
    // The account-switch case: A logs out of a phone, B logs in. A's streak
    // nudges and mentor chat must not keep landing on B's lock screen.
    const { t, admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_1, revoked_at: null },
      ],
    });
    await registerApnsEndpoint(admin, STUDENT_B, TOKEN_1);

    const aRow = t.notification_endpoints.find((r) => r.student_id === STUDENT_A)!;
    expect(aRow.revoked_at, 'the previous owner’s row must be revoked').toBeTruthy();
    expect(aRow.revoked_reason).toBe('token_reassigned_to_other_account');
    expect(liveApnsRows(t)).toHaveLength(1);
    expect(liveApnsRows(t)[0].student_id).toBe(STUDENT_B);
  });

  it('but the previous owner’s OTHER devices are untouched', async () => {
    const { t, admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_1, revoked_at: null },
        { id: 'e2', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_2, revoked_at: null },
        { id: 'e3', student_id: STUDENT_A, provider: 'web_push', subscription: { endpoint: 'https://x' }, revoked_at: null },
      ],
    });
    await registerApnsEndpoint(admin, STUDENT_B, TOKEN_1);

    expect(t.notification_endpoints.find((r) => r.id === 'e2')!.revoked_at ?? null, 'A’s second iPhone stays live').toBeNull();
    expect(t.notification_endpoints.find((r) => r.id === 'e3')!.revoked_at ?? null, 'A’s web push stays live').toBeNull();
  });
});

// ── E/F/G/H/K · ROUTING AND FAILURE, through the REAL sendPushToUser ────────

describe('E/F/G · each endpoint takes its own wire and only its own wire', () => {
  it('F · an APNs endpoint goes to the APNs sender — web-push is never dialed', async () => {
    const { admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_1, subscription: null, revoked_at: null },
      ],
      profiles: [],
    });
    fakeAdmin = admin;
    const res = await sendPushToUser(STUDENT_A, PAYLOAD);

    expect(res.ok).toBe(true);
    expect(apnsSend).toHaveBeenCalledTimes(1);
    expect(apnsSend.mock.calls[0][0]).toBe(TOKEN_1);
    expect(webpushSend, 'an APNs endpoint must never fall through to web-push').not.toHaveBeenCalled();
  });

  it('G/E · a web-push endpoint goes to web-push — APNs is never dialed (the pre-existing path is intact)', async () => {
    const { admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'web_push', device_token: null, subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: {} }, revoked_at: null },
      ],
      profiles: [],
    });
    fakeAdmin = admin;
    const res = await sendPushToUser(STUDENT_A, PAYLOAD);

    expect(res.ok).toBe(true);
    expect(webpushSend).toHaveBeenCalledTimes(1);
    expect(apnsSend, 'a web-push endpoint must never be sent to APNs').not.toHaveBeenCalled();
  });

  it('a mixed-provider student is reached on BOTH wires — the registry’s whole point', async () => {
    const { admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_1, subscription: null, revoked_at: null },
        { id: 'e2', student_id: STUDENT_A, provider: 'web_push', device_token: null, subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: {} }, revoked_at: null },
      ],
      profiles: [],
    });
    fakeAdmin = admin;
    await sendPushToUser(STUDENT_A, PAYLOAD);

    expect(apnsSend).toHaveBeenCalledTimes(1);
    expect(webpushSend).toHaveBeenCalledTimes(1);
  });
});

describe('H/K · a dead token kills one endpoint, never the student', () => {
  it('a terminal APNs result revokes THAT row while the web device still delivers', async () => {
    const { t, admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_1, subscription: null, revoked_at: null },
        { id: 'e2', student_id: STUDENT_A, provider: 'web_push', device_token: null, subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: {} }, revoked_at: null },
      ],
      profiles: [{ id: STUDENT_A, push_died_at: null }],
      notification_deliveries: [],
    });
    fakeAdmin = admin;
    apnsSend.mockResolvedValue({ ok: false, reason: 'apns_410_Unregistered', terminal: true });

    const res = await sendPushToUser(STUDENT_A, PAYLOAD);

    expect(res.ok, 'one live device means the student was reached').toBe(true);
    const e1 = t.notification_endpoints.find((r) => r.id === 'e1')!;
    expect(e1.revoked_at, 'the dead iPhone token must be revoked').toBeTruthy();
    const e2 = t.notification_endpoints.find((r) => r.id === 'e2')!;
    expect(e2.revoked_at ?? null, 'the healthy web device must be untouched').toBeNull();
    expect(t.profiles[0].push_died_at ?? null, 'the STUDENT must not be declared dead').toBeNull();
  });

  it('our own credential failure (apns_not_configured / 403) revokes nothing', async () => {
    const { t, admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_1, subscription: null, revoked_at: null },
      ],
      profiles: [{ id: STUDENT_A, push_died_at: null }],
      notification_deliveries: [],
    });
    fakeAdmin = admin;
    apnsSend.mockResolvedValue({ ok: false, reason: 'apns_not_configured', terminal: false });

    await sendPushToUser(STUDENT_A, PAYLOAD);

    expect(t.notification_endpoints[0].revoked_at ?? null, 'a config problem is ours, not the device’s').toBeNull();
  });

  it('every APNs attempt leaves per-endpoint delivery evidence, same as web push', async () => {
    const { t, admin } = db({
      notification_endpoints: [
        { id: 'e1', student_id: STUDENT_A, provider: 'apns', device_token: TOKEN_1, subscription: null, revoked_at: null },
      ],
      profiles: [],
      notification_deliveries: [],
    });
    fakeAdmin = admin;
    await sendPushToUser(STUDENT_A, PAYLOAD);

    expect(t.notification_deliveries).toHaveLength(1);
    expect(t.notification_deliveries[0].endpoint_id).toBe('e1');
    expect(t.notification_deliveries[0].provider_accepted_at).toBeTruthy();
  });
});

// ── THE CLASSIFICATION THE REVOKE DECISION RESTS ON ─────────────────────────

describe('classifyApnsResponse — the terminal line is drawn exactly where Apple draws it', () => {
  it('200 is acceptance (and only acceptance — never "delivered")', () => {
    expect(classifyApnsResponse(200, null)).toEqual({ ok: true });
  });
  it.each([
    [410, 'Unregistered'],
    [400, 'BadDeviceToken'],
    [400, 'DeviceTokenNotForTopic'],
  ])('%i %s is terminal — the app is gone or the token was never this app’s', (status, reason) => {
    expect(classifyApnsResponse(status, reason).terminal).toBe(true);
  });
  it.each([
    [403, 'ExpiredProviderToken'],
    [403, 'InvalidProviderToken'],
    [429, 'TooManyRequests'],
    [500, 'InternalServerError'],
    [503, 'ServiceUnavailable'],
    [400, 'BadMessageId'],
  ])('%i %s is NOT terminal — our problem or the weather, never the device’s', (status, reason) => {
    expect(classifyApnsResponse(status, reason).terminal).toBe(false);
  });
});

describe('token validation', () => {
  it('accepts opaque hex without assuming the historical 64 chars', () => {
    expect(isValidApnsToken('a'.repeat(64))).toBe(true);
    expect(isValidApnsToken('A0'.repeat(40))).toBe(true);
  });
  it('rejects everything that is not a plausible token', () => {
    expect(isValidApnsToken('a'.repeat(31))).toBe(false);
    expect(isValidApnsToken('z'.repeat(64))).toBe(false);
    expect(isValidApnsToken(42)).toBe(false);
    expect(isValidApnsToken(null)).toBe(false);
  });
});

// ── I/J/L · THE SEAMS THAT MUST NOT HAVE MOVED, AND THE SECRETS ─────────────

describe('I · the policy layer is untouched — APNs is a transport, not a channel', () => {
  it('notification-os and event-policy know nothing about providers', () => {
    for (const f of ['src/lib/notification-os.ts', 'src/lib/event-policy.ts']) {
      expect(codeOnly(readFileSync(f, 'utf8')), `${f} must not branch on apns`).not.toMatch(/apns/i);
    }
  });
});

describe('J · registration demands a session', () => {
  const route = codeOnly(readFileSync('src/app/api/push/register-apns/route.ts', 'utf8'));
  it('rejects the anonymous caller before reading the body', () => {
    expect(route).toMatch(/getUser\(\)/);
    const body = route.slice(route.indexOf('export async function POST'));
    expect(body.indexOf('401'), 'the auth check must precede token handling')
      .toBeLessThan(body.indexOf('isValidApnsToken(token)'));
  });
  it('binds the token only to the session’s own user id', () => {
    expect(route).toMatch(/registerApnsEndpoint\(admin, user\.id/);
    expect(route, 'no caller-supplied student id may reach the registration').not.toMatch(/body[\s\S]{0,40}student/i);
  });
});

describe('L · no key material anywhere a client could see it', () => {
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p, out);
      else out.push(p);
    }
    return out;
  };
  // .test. files never reach a client bundle — and this very file carries
  // the needle strings it scans for, so it must not scan itself.
  const srcFiles = walk('src').filter((f) => /\.(ts|tsx|js)$/.test(f) && !f.includes('.test.'));

  it('no .p8 file exists under src/ or supabase/, and no PEM block in source', () => {
    expect(walk('src').concat(walk('supabase')).filter((f) => f.endsWith('.p8'))).toEqual([]);
    for (const f of srcFiles) {
      // codeOnly, deliberately: a comment DESCRIBING the PEM format (apns.ts's
      // config doc does) is fine; an actual key would sit in a string literal,
      // which survives comment-stripping.
      expect(codeOnly(readFileSync(f, 'utf8')), `${f} must not embed a private key`).not.toContain('BEGIN PRIVATE' + ' KEY');
    }
  });

  it('APNs config is never exposed via NEXT_PUBLIC and never read outside apns.ts', () => {
    for (const f of srcFiles) {
      const code = readFileSync(f, 'utf8');
      expect(code, `${f} leaks APNs config to the client bundle`).not.toMatch(/NEXT_PUBLIC_APNS/);
      if (!f.endsWith('src/lib/apns.ts')) {
        expect(codeOnly(code), `${f} must not read APNS_AUTH_KEY — the key is apns.ts's alone`).not.toMatch(/APNS_AUTH_KEY/);
      }
    }
  });

  it('sendApnsToToken has exactly one production caller: push.ts', () => {
    const callers = srcFiles.filter((f) =>
      !f.endsWith('src/lib/apns.ts') &&
      codeOnly(readFileSync(f, 'utf8')).includes('sendApnsToToken'));
    expect(callers).toEqual(['src/lib/push.ts']);
  });
});

describe('the token bridge — the page half the native shell calls into', () => {
  const bridge = codeOnly(readFileSync('src/components/apns-token-bridge.tsx', 'utf8'));
  const layout = codeOnly(readFileSync('src/app/student/layout.tsx', 'utf8'));

  it('defines the exact global the native setup guide instructs Xcode to call', () => {
    expect(bridge).toMatch(/__careerraiRegisterApnsToken/);
    expect(bridge).toMatch(/fetch\('\/api\/push\/register-apns'/);
  });

  it('is mounted inside the AUTHENTICATED student layout — the session is the identity', () => {
    // Mounting it anywhere pre-auth would post tokens with no session (401,
    // harmless) or, worse, invite a caller-supplied identity. The layout only
    // renders signed-in, so the cookie on the fetch is always the student's own.
    expect(layout).toMatch(/<ApnsTokenBridge \/>/);
  });

  it('sends the token and nothing else — no student id, no preference, no secret', () => {
    expect(bridge).toMatch(/JSON\.stringify\(\{ token \}\)/);
    expect(bridge).not.toMatch(/student|user_id|APNS_/i);
  });
});

describe('the send path still ends at dispatch() — no second notification system', () => {
  const push = codeOnly(readFileSync('src/lib/push.ts', 'utf8'));
  it('the APNs branch records delivery and revokes through the same registry functions', () => {
    const branch = push.slice(push.indexOf("ep.provider === 'apns'"), push.indexOf('if (!ep.subscription)'));
    expect(branch).toMatch(/recordDelivery\(admin, payload\.notifId, ep\.id/);
    expect(branch).toMatch(/revokeEndpoint\(admin, ep\.id/);
  });
  it('the web-push wire itself is byte-familiar: same retry shape, same terminal rule', () => {
    expect(push).toMatch(/statusCode === 410 \|\| statusCode === 404/);
    expect(push).toMatch(/results\.every\(\(r\) => r\.terminal\)/);
  });
});
