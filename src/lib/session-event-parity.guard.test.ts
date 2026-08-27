import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { hasDeclaredPolicy } from './event-policy';

// ── ONE state change, ONE telling ──────────────────────────────────────────
//
// EVENT-OS: "ONE BUSINESS EVENT → ONE AUTHORITY → MANY CHANNELS. Retry the
// delivery, never the event." For session lifecycle events the risk is not
// the transport — it is the PRODUCER, in two opposite directions:
//
//   the route tells someone about a change it did not make
//       → audit finding F1: a cancel that lost the race still said
//         "Session cancelled" to a student whose session had COMPLETED
//
//   the route makes a change and tells nobody
//       → release-stale-sessions, found 27 Aug: a paid session expired, the
//         credit went to a recovery queue, the timeline and the audit log
//         both recorded it, and the student who paid ₹299 was never told
//
// Both are producer bugs and neither is visible to a delivery metric: the
// first sends a notification nobody should have got, the second sends none at
// all, and in both cases every row in `notifications` is perfectly consistent.
//
// The shape that prevents both is the same one, and it is what this guard
// checks: a STATUS-GUARDED update, whose ROW COUNT is read, gating the
// dispatch. Zero rows means somebody else already owned this transition —
// so there is nothing to announce, and a cron rerun announces nothing twice.

const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every route that moves a session into a state a human should hear about. */
const TRANSITIONS: Array<{ file: string; what: string }> = [
  { file: 'src/app/api/calendar/cancel-meeting/route.ts', what: 'mentor cancels' },
  { file: 'src/app/api/calendar/reschedule-meeting/route.ts', what: 'mentor moves it' },
  { file: 'src/app/api/admin/buddy-integration/route.ts', what: 'ops cancels' },
  { file: 'src/app/api/cron/release-stale-sessions/route.ts', what: 'nobody joined' },
  { file: 'src/app/api/buddy/commitment/route.ts', what: 'mentor closes it out' },
  // Added 27 Aug by the final gate. This route was NOT in the list, and it was
  // the one terminal transition that never read its row count — so the guard
  // that exists to catch exactly that had a hole shaped like the defect.
  { file: 'src/app/api/calendar/complete-orientation/route.ts', what: 'mentor completes an orientation' },
];

describe('every session transition a person should hear about produces exactly one event', () => {
  it.each(TRANSITIONS)('$what — the update is status-guarded', ({ file }) => {
    const code = strip(readFileSync(file, 'utf8'));
    expect(
      /\.update\([\s\S]{0,400}?\.(in|eq)\('session_status'/.test(code),
      `${file} changes a session without guarding on its current status. Two callers then both "succeed" and both announce it.`,
    ).toBe(true);
  });

  it.each(TRANSITIONS)('$what — the row count is read back', ({ file }) => {
    const code = strip(readFileSync(file, 'utf8'));
    expect(
      /\.(in|eq)\('session_status'[^)]*\)\s*\.select\(/.test(code),
      `${file} guards the update but never asks how many rows it changed — so it cannot tell "I did this" from "someone beat me to it".`,
    ).toBe(true);
  });

  it.each(TRANSITIONS)('$what — the telling is gated on that row count', ({ file }) => {
    const code = strip(readFileSync(file, 'utf8'));
    // Some variable derived from the returned rows must be tested before the
    // dispatch. Accepts the shapes actually used: `!updated?.length` + continue,
    // `(rows?.length ?? 0) > 0`, an `already*` flag, or a 409 return.
    const gated =
      /if \(!\w+\?\.length\)/.test(code) ||
      /\(\w+\?\.length \?\? 0\) > 0/.test(code) ||
      /if \(!?already\w*\)/i.test(code) ||
      /=== 0\) \{[\s\S]{0,200}?status: 409/.test(code) ||
      /if \(\w*[Cc]ompleted \|\|/.test(code);
    expect(
      gated,
      `${file} dispatches without checking whether its own update actually changed anything. This is audit finding F1: a student whose session COMPLETED was told it was cancelled.`,
    ).toBe(true);
  });

  it.each(TRANSITIONS)('$what — somebody is actually told', ({ file }) => {
    const code = strip(readFileSync(file, 'utf8'));
    expect(
      code.includes('dispatch('),
      `${file} changes a session and notifies nobody. Every record of it goes to an internal ledger the student cannot see — which is how an expired paid session became invisible to the person who paid for it.`,
    ).toBe(true);
  });
});

describe('the session events are registered, so their channels are decided not defaulted', () => {
  const SESSION_EVENTS = [
    'session_scheduled', 'session_rescheduled', 'session_cancelled',
    'session_expired', 'session_reminder', 'session_request', 'session_debrief',
  ];
  it.each(SESSION_EVENTS)('%s has a declared policy', (type) => {
    expect(hasDeclaredPolicy(type)).toBe(true);
  });
});

describe('the 24-hour reminder cannot fire twice when both schedulers run', () => {
  const code = strip(readFileSync('src/app/api/cron/session-tomorrow/route.ts', 'utf8'));

  it('dedups per session AND per recipient, not per day', () => {
    expect(code).toMatch(/\.eq\('data->>session_id', session\.id\)/);
  });

  it('a FAILED dedup read stops the send — it never falls through to "not reminded"', () => {
    // The failure mode that matters: a read error treated as "no rows" turns
    // the safety check into a second reminder for everyone.
    expect(code).toMatch(/if \(error\) \{ dedupFailed = true; break; \}/);
    expect(code).toMatch(/dedupFailed/);
  });

  it('the session_id it dedups on is the same one it writes', () => {
    expect(code).toMatch(/data: \{ session_id: session\.id/);
  });
});
