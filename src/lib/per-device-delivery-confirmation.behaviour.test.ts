import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './test-support/code-only';
import { confirmDelivery } from './notification-endpoints';

/**
 * ── A PUSH SENT TO DEVICE A IS CONFIRMABLE ONLY BY DEVICE A ─────────────────
 *
 * Task #79, from the 3 Sep reach audit. `notification_deliveries.device_
 * confirmed_at` was written 0 times in 682 rows: the service worker's arrival
 * beacon carried only a notification id, so every receipt named a STUDENT and
 * never the DEVICE that displayed it.
 *
 * It looked harmless only because the Step 1 backfill left the registry at
 * exactly one endpoint per student, making the two the same number by
 * accident. Step 2 enabled many endpoints per student, so the first student
 * with a second device makes every reach figure ambiguous.
 *
 * These drive the REAL confirmDelivery() against a fake that models what the
 * database actually enforces — including the unique index on
 * (notification_id, endpoint_id) — and assert on the rows that end up written,
 * not on the shape of the source.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

type Row = Record<string, any>;

/**
 * In-memory Postgres-shaped fake. Models the three things this function's
 * correctness rests on: filters compose, `update().select()` returns the rows
 * that actually matched, and `upsert(onConflict)` updates ONLY the columns
 * supplied (which is what preserves a device_confirmed_at through a re-send).
 */
function db(seed: { notifications?: Row[]; endpoints?: Row[]; deliveries?: Row[] }) {
  const t: Record<string, Row[]> = {
    notifications: seed.notifications ?? [],
    notification_endpoints: seed.endpoints ?? [],
    notification_deliveries: seed.deliveries ?? [],
  };

  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let mode: 'select' | 'update' | 'upsert' = 'select';
    let patch: Row = {};
    let incoming: Row = {};
    let conflict: string[] = [];

    const matched = () => (t[table] ?? []).filter((r) => filters.every((f) => f(r)));

    const run = () => {
      if (mode === 'update') {
        const hit = matched();
        hit.forEach((r) => Object.assign(r, patch));
        return { data: hit.map((r) => ({ ...r })), error: null };
      }
      if (mode === 'upsert') {
        const clash = (t[table] ?? []).find((r) => conflict.every((c) => r[c] === incoming[c]));
        if (clash) {
          // ON CONFLICT DO UPDATE SET <supplied columns> — untouched columns survive.
          Object.assign(clash, incoming);
          return { data: [{ ...clash }], error: null };
        }
        t[table].push({ ...incoming });
        return { data: [{ ...incoming }], error: null };
      }
      return { data: matched().map((r) => ({ ...r })), error: null };
    };

    const q: any = {
      select: () => q,
      eq: (c: string, v: unknown) => { filters.push((r) => r[c] === v); return q; },
      is: (c: string, v: unknown) => { filters.push((r) => (r[c] ?? null) === v); return q; },
      update: (p: Row) => { mode = 'update'; patch = p; return q; },
      upsert: (r: Row, o?: { onConflict?: string }) => {
        mode = 'upsert';
        incoming = r;
        conflict = (o?.onConflict ?? '').split(',').map((s) => s.trim()).filter(Boolean);
        return q;
      },
      maybeSingle: async () => ({ data: run().data[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve(run()).then(ok),
    };
    return q;
  };

  return { t, admin: { from } };
}

const STUDENT_A = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const STUDENT_B = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';
const NOTIF_X = '11111111-1111-4111-1111-111111111111';
const NOTIF_Y = '22222222-2222-4222-2222-222222222222';
const EP_PHONE = 'eeee1111-1111-4111-1111-111111111111';
const EP_TABLET = 'eeee2222-2222-4222-2222-222222222222';
const EP_STRANGER = 'eeee3333-3333-4333-3333-333333333333';

/** One student, one phone, one notification already sent to it. */
function oneDevice() {
  return db({
    notifications: [{ id: NOTIF_X, user_id: STUDENT_A }],
    endpoints: [{ id: EP_PHONE, student_id: STUDENT_A, revoked_at: null }],
    deliveries: [{ notification_id: NOTIF_X, endpoint_id: EP_PHONE, provider_accepted_at: 't0', device_confirmed_at: null }],
  });
}

describe('A · the right device confirms the right delivery', () => {
  it('stamps device_confirmed_at on THAT delivery row', async () => {
    const { t, admin } = oneDevice();
    const out = await confirmDelivery(admin, NOTIF_X, EP_PHONE);

    expect(out).toBe('confirmed');
    expect(t.notification_deliveries[0].device_confirmed_at).toBeTruthy();
  });

  it('and moves the endpoint’s own last-confirmed watermark', async () => {
    // What lets a reach query ask "which DEVICES are proven live" without
    // walking every delivery row.
    const { t, admin } = oneDevice();
    await confirmDelivery(admin, NOTIF_X, EP_PHONE);

    expect(t.notification_endpoints[0].last_delivery_confirmed_at).toBeTruthy();
  });
});

describe('B/D/E · a pair we did not create is refused', () => {
  it('refuses an endpoint belonging to ANOTHER student', async () => {
    // The attack this function exists to refuse: the beacon is unauthenticated,
    // so a caller could name someone else's device.
    const { t, admin } = db({
      notifications: [{ id: NOTIF_X, user_id: STUDENT_A }],
      endpoints: [{ id: EP_STRANGER, student_id: STUDENT_B, revoked_at: null }],
      deliveries: [{ notification_id: NOTIF_X, endpoint_id: EP_STRANGER, device_confirmed_at: null }],
    });

    expect(await confirmDelivery(admin, NOTIF_X, EP_STRANGER)).toBe('rejected');
    expect(t.notification_deliveries[0].device_confirmed_at, 'cross-student confirmation must not land').toBeNull();
    expect(t.notification_endpoints[0].last_delivery_confirmed_at).toBeUndefined();
  });

  it('refuses an endpoint id we have never issued', async () => {
    const { t, admin } = oneDevice();
    expect(await confirmDelivery(admin, NOTIF_X, EP_STRANGER)).toBe('rejected');
    expect(t.notification_deliveries[0].device_confirmed_at).toBeNull();
  });

  it('refuses a notification id we have never issued', async () => {
    const { t, admin } = oneDevice();
    expect(await confirmDelivery(admin, NOTIF_Y, EP_PHONE)).toBe('rejected');
    expect(t.notification_deliveries).toHaveLength(1);
    expect(t.notification_deliveries[0].device_confirmed_at).toBeNull();
  });

  it('refuses a notification raised for a DIFFERENT student than owns the device', async () => {
    const { t, admin } = db({
      notifications: [{ id: NOTIF_X, user_id: STUDENT_B }],
      endpoints: [{ id: EP_PHONE, student_id: STUDENT_A, revoked_at: null }],
      deliveries: [{ notification_id: NOTIF_X, endpoint_id: EP_PHONE, device_confirmed_at: null }],
    });

    expect(await confirmDelivery(admin, NOTIF_X, EP_PHONE)).toBe('rejected');
    expect(t.notification_deliveries[0].device_confirmed_at).toBeNull();
  });
});

describe('C · a replayed beacon is harmless', () => {
  it('the second receipt changes nothing and creates no second fact', async () => {
    // The SW retries a failed POST once, and a push can be replayed by the OS.
    const { t, admin } = oneDevice();

    expect(await confirmDelivery(admin, NOTIF_X, EP_PHONE)).toBe('confirmed');
    const firstStamp = t.notification_deliveries[0].device_confirmed_at;

    expect(await confirmDelivery(admin, NOTIF_X, EP_PHONE)).toBe('already');
    expect(t.notification_deliveries, 'a replay must not create a second delivery row').toHaveLength(1);
    expect(t.notification_deliveries[0].device_confirmed_at, 'the original receipt time must survive').toBe(firstStamp);
  });

  it('three beacons still leave exactly one confirmed row', async () => {
    const { t, admin } = oneDevice();
    await confirmDelivery(admin, NOTIF_X, EP_PHONE);
    await confirmDelivery(admin, NOTIF_X, EP_PHONE);
    await confirmDelivery(admin, NOTIF_X, EP_PHONE);
    expect(t.notification_deliveries).toHaveLength(1);
  });
});

describe('the race the sender opens', () => {
  it('a device that beacons BEFORE the delivery row exists is still counted', async () => {
    // recordDelivery() writes the row only after webpush.sendNotification()
    // resolves. A fast device can beacon inside that window. Dropping those
    // receipts would silently under-count the healthiest devices — the exact
    // class of measurement gap task #79 exists to close.
    const { t, admin } = db({
      notifications: [{ id: NOTIF_X, user_id: STUDENT_A }],
      endpoints: [{ id: EP_PHONE, student_id: STUDENT_A, revoked_at: null }],
      deliveries: [], // sender has not written it yet
    });

    expect(await confirmDelivery(admin, NOTIF_X, EP_PHONE)).toBe('confirmed');
    expect(t.notification_deliveries).toHaveLength(1);
    expect(t.notification_deliveries[0].device_confirmed_at).toBeTruthy();
  });

  it('and the sender landing afterwards does not erase that confirmation', async () => {
    // recordDelivery() upserts on the same conflict target WITHOUT naming
    // device_confirmed_at, so the column it does not mention survives.
    const { t, admin } = db({
      notifications: [{ id: NOTIF_X, user_id: STUDENT_A }],
      endpoints: [{ id: EP_PHONE, student_id: STUDENT_A, revoked_at: null }],
      deliveries: [],
    });
    await confirmDelivery(admin, NOTIF_X, EP_PHONE);
    const stamped = t.notification_deliveries[0].device_confirmed_at;

    const { recordDelivery } = await import('./notification-endpoints');
    await recordDelivery(admin, NOTIF_X, EP_PHONE, { accepted: true });

    expect(t.notification_deliveries, 'the sender must not add a second row').toHaveLength(1);
    expect(t.notification_deliveries[0].device_confirmed_at, 'a late send record must not erase a real receipt').toBe(stamped);
    expect(t.notification_deliveries[0].provider_accepted_at).toBeTruthy();
  });
});

describe('F · a revoked device', () => {
  it('may still confirm — a push already in flight can land after the 410', async () => {
    // Refusing this would discard true evidence that a real display happened.
    // The row keeps its own revoked_at, so "dead endpoint" and "this push was
    // displayed" stay separable facts rather than one lossy verdict.
    const { t, admin } = db({
      notifications: [{ id: NOTIF_X, user_id: STUDENT_A }],
      endpoints: [{ id: EP_PHONE, student_id: STUDENT_A, revoked_at: 'yesterday' }],
      deliveries: [{ notification_id: NOTIF_X, endpoint_id: EP_PHONE, device_confirmed_at: null }],
    });

    expect(await confirmDelivery(admin, NOTIF_X, EP_PHONE)).toBe('confirmed');
    expect(t.notification_endpoints[0].revoked_at, 'confirming must not un-revoke a dead device').toBe('yesterday');
  });
});

describe('G/H · one student, two devices', () => {
  /** Phone and tablet, each sent its own notification, plus one sent to both. */
  function twoDevices() {
    return db({
      notifications: [
        { id: NOTIF_X, user_id: STUDENT_A },
        { id: NOTIF_Y, user_id: STUDENT_A },
      ],
      endpoints: [
        { id: EP_PHONE, student_id: STUDENT_A, revoked_at: null },
        { id: EP_TABLET, student_id: STUDENT_A, revoked_at: null },
      ],
      deliveries: [
        { notification_id: NOTIF_X, endpoint_id: EP_PHONE, device_confirmed_at: null },
        { notification_id: NOTIF_Y, endpoint_id: EP_TABLET, device_confirmed_at: null },
        { notification_id: NOTIF_X, endpoint_id: EP_TABLET, device_confirmed_at: null },
      ],
    });
  }

  const find = (t: Record<string, Row[]>, n: string, e: string) =>
    t.notification_deliveries.find((r) => r.notification_id === n && r.endpoint_id === e)!;

  it('G · receipts stay separated: the phone confirming X leaves the tablet’s Y alone', async () => {
    const { t, admin } = twoDevices();

    await confirmDelivery(admin, NOTIF_X, EP_PHONE);

    expect(find(t, NOTIF_X, EP_PHONE).device_confirmed_at).toBeTruthy();
    expect(find(t, NOTIF_Y, EP_TABLET).device_confirmed_at, 'the other device’s notification must be untouched').toBeNull();
    expect(find(t, NOTIF_X, EP_TABLET).device_confirmed_at, 'the same notification on the OTHER device must be untouched').toBeNull();
  });

  it('H · the same notification on both devices yields TWO independent confirmations', async () => {
    // The precise thing student-level receipt could never express: one
    // notification, displayed on two phones, is two device facts.
    const { t, admin } = twoDevices();

    expect(await confirmDelivery(admin, NOTIF_X, EP_PHONE)).toBe('confirmed');
    expect(await confirmDelivery(admin, NOTIF_X, EP_TABLET)).toBe('confirmed');

    expect(find(t, NOTIF_X, EP_PHONE).device_confirmed_at).toBeTruthy();
    expect(find(t, NOTIF_X, EP_TABLET).device_confirmed_at).toBeTruthy();
    expect(t.notification_deliveries.filter((r) => r.device_confirmed_at).length).toBe(2);
  });

  it('a re-registered device cannot inherit the old device’s receipts', async () => {
    // Re-registration mints a NEW row id, so the retired id can never confirm
    // against the replacement's deliveries.
    const { t, admin } = twoDevices();
    await confirmDelivery(admin, NOTIF_X, EP_PHONE);

    expect(find(t, NOTIF_X, EP_TABLET).device_confirmed_at).toBeNull();
  });
});

// ── I/J · THE THINGS THAT MUST NOT HAVE MOVED ───────────────────────────────
//
// The device layer is strictly ADDITIVE. Student-level receipt and 410 cleanup
// are load-bearing behaviour that predates it, and a measurement upgrade that
// quietly changed either would be a worse bug than the one being fixed.

describe('I · student-level receipt did not regress', () => {
  const route = codeOnly(readFileSync('src/app/api/push/received/route.ts', 'utf8'));

  it('still stamps notifications.received_at, once, on a null', () => {
    expect(route).toMatch(/update\(\{\s*received_at:\s*now\s*\}\)/);
    expect(route, 'the set-once guard is what makes the beacon idempotent').toMatch(/\.is\('received_at',\s*null\)/);
  });

  it('still stamps profiles.push_verified_at for the student', () => {
    expect(route).toMatch(/push_verified_at:\s*now/);
  });

  it('the device step cannot fail the student step — it runs after, and refuses via a status', () => {
    const receivedAt = route.indexOf('received_at: now');
    // the CALL, not the import at the top of the file
    const deviceStep = route.indexOf('confirmDelivery(admin');
    expect(receivedAt).toBeGreaterThan(-1);
    expect(deviceStep).toBeGreaterThan(-1);
    expect(deviceStep, 'device confirmation must come after the student receipt is banked').toBeGreaterThan(receivedAt);
  });

  it('a beacon with NO endpointId takes none of the device path', async () => {
    // Every student still on the legacy fallback column sends no endpointId.
    // Their beacon must behave exactly as it did before this change.
    expect(route).toMatch(/device[\s\S]{0,120}=\s*'absent'/);
    expect(route, 'the device path is entered only for a well-formed endpoint id')
      .toMatch(/typeof endpointId === 'string' && UUID_RE\.test\(endpointId\)/);
  });
});

describe('J · 410 cleanup and the send boundary did not regress', () => {
  const push = codeOnly(readFileSync('src/lib/push.ts', 'utf8'));

  it('a terminal failure still revokes exactly that endpoint', () => {
    expect(push).toMatch(/if \(last\.terminal && ep\.id\) await revokeEndpoint\(admin, ep\.id/);
  });

  it('the student is still declared dead only when EVERY endpoint failed terminally', () => {
    // .every, never .some — one stale laptop must not bury a live phone.
    expect(push).toMatch(/results\.every\(\(r\) => r\.terminal\)/);
    expect(push).not.toMatch(/results\.some\(\(r\) => r\.terminal\)/);
  });

  it('410/404 are still the only terminal statuses', () => {
    expect(push).toMatch(/statusCode === 410 \|\| statusCode === 404/);
  });
});

// ── THE MUTATION GUARD ──────────────────────────────────────────────────────
//
// Every behavioural test above runs against confirmDelivery() directly. That
// leaves one way to silently undo this work and still get a green suite:
// stop PUTTING the endpoint id in the payload, or stop ECHOING it from the
// service worker. Then confirmDelivery is perfect and never called, and the
// device_confirmed_at column quietly returns to zero — exactly the state the
// audit found. These pin the two ends of the wire.

describe('the attribution wire cannot be removed silently', () => {
  it('push.ts puts the endpoint id into the payload data', () => {
    const push = codeOnly(readFileSync('src/lib/push.ts', 'utf8'));
    expect(push, 'without this the SW has nothing to echo back')
      .toMatch(/endpointId \? \{ endpointId \} : \{\}/);
    expect(push, 'the id must be threaded from the endpoint being sent to')
      .toMatch(/attemptSend\([\s\S]{0,160}ep\.id\)/);
  });

  it('sw.js echoes it back on the arrival beacon', () => {
    const sw = codeOnly(readFileSync('public/sw.js', 'utf8'));
    expect(sw).toMatch(/notificationData\.data\.endpointId/);
    expect(sw, 'the beacon body must carry it')
      .toMatch(/endpointId \? \{ id: notifId, endpointId: endpointId \} : \{ id: notifId \}/);
  });

  it('the receipt route hands the pair to the ownership check, not straight to a write', () => {
    const route = codeOnly(readFileSync('src/app/api/push/received/route.ts', 'utf8'));
    expect(route).toMatch(/confirmDelivery\(admin, id, endpointId\)/);
    expect(route, 'the route must never write the delivery table itself')
      .not.toMatch(/from\('notification_deliveries'\)/);
  });

  it('confirmDelivery refuses to skip the ownership comparison', () => {
    const mod = codeOnly(readFileSync('src/lib/notification-endpoints.ts', 'utf8'));
    expect(mod, 'the cross-student check is the whole security boundary')
      .toMatch(/notif\.user_id !== ep\.student_id/);
  });

  it('the unique index the idempotency rests on is a committed migration', () => {
    const sql = readFileSync('supabase/migrations/20260903a_per_device_delivery_confirmation.sql', 'utf8');
    expect(sql).toMatch(/create unique index[\s\S]*notification_deliveries[\s\S]*\(notification_id, endpoint_id\)/i);
  });
});
