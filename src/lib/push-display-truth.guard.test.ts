import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readDisplayOutcome, displayColumns } from './notification-endpoints';

// ── PHASE 0: A RECEIPT IS NOT A DISPLAY ─────────────────────────────────────
//
// Founder, 17 Sep 2026: "notification dikhna bahut zaroori hai." Before that can
// be fixed it has to be visible, and it was not.
//
// THE MEASUREMENT THAT FORCED THIS. Over 14 days, 100 notifications were
// CLICKED — unarguable proof of a render on a student's screen. **18 of those
// 100 have `device_confirmed_at = NULL`.** And 18% is a FLOOR: it is measured
// only on notifications that were clicked, i.e. on devices whose network held
// up. Where the beacon died of a bad connection, the click usually died too.
//
// So "53% device confirmed" was never a delivery rate, and every platform
// conclusion drawn from it — including "Android needs a Play Store build" —
// rested on a broken instrument. This suite exists so the instrument cannot
// quietly break again in the same direction.

const SW = readFileSync('public/sw.js', 'utf8');

describe('the display outcome is read as untrusted input', () => {
  it('takes a well-formed outcome', () => {
    expect(readDisplayOutcome({ attempted: true, resolved: true, error: null }))
      .toEqual({ attempted: true, resolved: true, error: null });
    expect(readDisplayOutcome({ attempted: true, resolved: false, error: 'boom' }))
      .toEqual({ attempted: true, resolved: false, error: 'boom' });
  });

  it('rejects anything malformed rather than guessing', () => {
    // The beacon is unauthenticated — the SW may hold no session — so this is a
    // trust boundary, not a convenience parser.
    for (const bad of [null, undefined, 'yes', 42, [], {}, { attempted: 'true', resolved: true },
      { attempted: true }, { resolved: true }]) {
      expect(readDisplayOutcome(bad), String(JSON.stringify(bad))).toBeNull();
    }
  });

  it('never lets a resolved display carry an error, whatever the wire says', () => {
    expect(readDisplayOutcome({ attempted: true, resolved: true, error: 'ignored' })?.error).toBeNull();
  });

  it('bounds the error text', () => {
    const out = readDisplayOutcome({ attempted: true, resolved: false, error: 'x'.repeat(5000) });
    expect(out?.error?.length).toBe(300);
    // An empty or whitespace error is absent, not an empty string.
    expect(readDisplayOutcome({ attempted: true, resolved: false, error: '   ' })?.error).toBeNull();
  });
});

describe('the columns say exactly what happened, and nothing more', () => {
  const now = '2026-09-17T12:00:00.000Z';

  it('a resolved display stamps displayed_at and no error', () => {
    const c = displayColumns({ attempted: true, resolved: true, error: null }, now);
    expect(c.display_attempted_at).toBe(now);
    expect(c.displayed_at).toBe(now);
    expect(c.display_status).toBe('resolved');
    expect(c.display_error_at).toBeNull();
    expect(c.display_error).toBeNull();
  });

  it('a rejected display stamps the error and NOT displayed_at', () => {
    const c = displayColumns({ attempted: true, resolved: false, error: 'TypeError' }, now);
    expect(c.displayed_at, 'nothing was displayed').toBeNull();
    expect(c.display_error_at).toBe(now);
    expect(c.display_status).toBe('error');
    expect(c.display_error).toBe('TypeError');
  });

  it('never invents a "seen" column', () => {
    const keys = Object.keys(displayColumns({ attempted: true, resolved: true, error: null }, now));
    // `resolved` means the OS accepted the render request. Do Not Disturb,
    // Focus, OEM standby and a phone in a pocket all sit past that boundary and
    // no web API crosses it. `clicked_at` stays the only proof a human saw it.
    for (const forbidden of ['seen', 'viewed', 'delivered', 'read']) {
      expect(keys.some((k) => k.includes(forbidden)), `${forbidden} cannot be proven`).toBe(false);
    }
  });
});

describe('the service worker can never fail a push event', () => {
  it('showNotification cannot reject into waitUntil', () => {
    // It could before: only the chat branch had a catch, so one malformed
    // payload failed the push event on every platform — and on iOS a push that
    // displays nothing counts against the subscription until it is revoked.
    expect(SW).toMatch(/showPromise\.then\(\s*\n?\s*function \(\) \{ display\.resolved = true; \}/);
    expect(SW, 'the rejection handler records it instead of throwing').toMatch(/display\.error = String\(/);
    expect(SW, 'waitUntil waits on the settled promise, not the raw one').toContain('const work = [settled]');
  });

  it('a dataless push still displays something', () => {
    // Apple: every push must produce a user-visible notification. This path
    // used to `return` and show nothing.
    const block = SW.slice(SW.indexOf('if (!event.data)'), SW.indexOf('if (!event.data)') + 700);
    expect(block).toContain('showNotification');
    expect(block, 'and it may not reject either').toContain('.catch(');
  });

  it('the outcome rides the same route and the same function — but no longer the same call', () => {
    // AMENDED 22 Sep 2026, Incident #102. The original assertion was "one call,
    // richer payload", reasoning that a waking radio is the most expensive
    // moment to spend a request in. That reasoning was never wrong; it was
    // outweighed. Chaining the receipt behind showNotification to save the
    // request cost 82% of all receipts — device confirmation fell 62% -> 12%
    // over four days as the worker propagated. The receipt now fires unchained
    // and the display outcome follows as a second call.
    //
    // What this assertion was really protecting, and still does: the display
    // outcome must not grow its own endpoint, its own payload shape or its own
    // transport. One route, one function, one body format.
    expect(SW).toContain('if (display) body.display = display;');
    const routes = [...SW.matchAll(/beaconWithRetry\(\s*'([^']+)'/g)].map((m) => m[1]);
    expect(new Set(routes), 'no new endpoint may appear for the display outcome')
      .toEqual(new Set(['/api/push/received', '/api/push/click']));
  });
});

describe('the old evidence is kept, not renamed away', () => {
  const sql = readFileSync('supabase/migrations/20260917b_display_is_not_receipt.sql', 'utf8');

  it('the migration is additive', () => {
    expect(sql).toMatch(/add column if not exists sw_receipt_at/);
    expect(sql).toMatch(/add column if not exists display_attempted_at/);
    expect(sql).toMatch(/add column if not exists display_error_at/);
    // device_confirmed_at carries the proof that receipts undercount displays.
    // Deleting the evidence of a measurement bug is how the bug comes back.
    expect(sql, 'nothing is dropped').not.toMatch(/drop column/i);
    expect(sql, 'nothing is renamed').not.toMatch(/rename/i);
    // displayed_at / display_status / display_error already existed, 100% NULL
    // across 14,445 rows. Reused, not duplicated.
    expect(sql).not.toMatch(/add column if not exists displayed_at/);
  });

  it('the receipt writes both names at the same instant', () => {
    const src = readFileSync('src/lib/notification-endpoints.ts', 'utf8');
    expect(src).toMatch(/const receipt = \{ device_confirmed_at: now, sw_receipt_at: now \}/);
  });

  it('a bad display field never costs us the receipt', () => {
    const route = readFileSync('src/app/api/push/received/route.ts', 'utf8');
    // readDisplayOutcome returns null on anything malformed and confirmDelivery
    // proceeds — the receipt is the older and more important signal.
    expect(route).toContain('const outcome = readDisplayOutcome(display);');
    expect(route).toContain('confirmDelivery(admin, id, endpointId, outcome)');
  });
});
