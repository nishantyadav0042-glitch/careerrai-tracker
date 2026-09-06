import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { decideBookability, type BookabilityFacts } from './session-assignment';
import { codeOnly } from './test-support/code-only';

// ── ONE BUSINESS RULE, ONE AUTHORITY, EVERYTHING ELSE A CONSUMER ────────────
//
// On 27 Aug an audit found SEVEN independent definitions of "can this mentor
// be booked", giving FOUR different answers for one real mentor — Shreya, who
// had a pasted meeting room, no working hours and no Google:
//
//   · the booking API said no (correct — no availability)
//   · her own home screen showed nothing wrong
//   · the admin roster counted her READY and offered her free slots
//   · video-health and integration-metrics said she could not book and blamed
//     Google — a requirement removed elsewhere as "a design mistake", so those
//     two were reporting an outage that did not exist while missing the one
//     that did
//   · SessionReadiness told her "students cannot book you" for the same wrong
//     reason
//
// A student had paid ₹299 two days earlier and could not pick a time.
//
// decideBookability() is now the only place the rule exists. Adapters are
// allowed; competing definitions are not.

// The BOOKABLE baseline, so each test states only what it is varying. Both a
// room and Google are in the baseline; as of 5 Sep either one satisfies the
// room half, so the tests below vary them independently.
const facts = (o: Partial<BookabilityFacts> = {}): BookabilityFacts => ({
  availability: { active: true },
  hasRoom: true,
  googleConnected: true,
  ...o,
});

describe('the six states, enumerated', () => {
  it('availability ✗ / room ✗ / google ✗ → not bookable', () => {
    const d = decideBookability(facts({ availability: null, hasRoom: false }));
    expect(d.bookable).toBe(false);
    expect(d).toMatchObject({ reason: 'no_availability' });
  });

  it('availability ✗ / room ✓ / google ✗ → not bookable — SHREYA’S STATE', () => {
    const d = decideBookability(facts({ availability: null, hasRoom: true }));
    expect(d.bookable).toBe(false);
    expect(d).toMatchObject({ reason: 'no_availability' });
  });

  it('availability ✓ / room ✗ / google ✗ → not bookable', () => {
    const d = decideBookability(facts({ hasRoom: false, googleConnected: false }));
    expect(d.bookable).toBe(false);
    expect(d).toMatchObject({ reason: 'no_meeting_room' });
  });

  it('availability ✓ / room ✓ / google ✗ → BOOKABLE — the 5 Sep restoration', () => {
    // This case has now flipped TWICE, so the history matters.
    //
    // Originally a pasted link satisfied the rule ("a room is a room"). On
    // 27 Aug Google became the sole requirement, knowingly trading away the
    // risk that booking would be "hostage to Google's verification queue".
    // The queue never cleared: our OAuth app uses the sensitive
    // calendar.events scope, so every mentor meets a red "Google hasn't
    // verified this app" screen. On 5 Sep production had ZERO of seven
    // mentors connected — every mentor unbookable, every student routed to
    // "our team will arrange your session".
    //
    // So a pasted room counts again. It is worse than Google (no calendar
    // event, no reminders) but it satisfies the law that protects the
    // student: validateRoomLink checks it, and TRUST-OS requires that a link
    // be verifiable, not that Google mint it.
    const d = decideBookability(facts({ hasRoom: true, googleConnected: false }));
    expect(d.bookable).toBe(true);
  });

  it('availability ✓ / room ✗ / google ✓ → BOOKABLE', () => {
    // Google alone still suffices — it mints the room itself.
    expect(decideBookability(facts({ hasRoom: false, googleConnected: true })).bookable).toBe(true);
  });

  it('availability ✓ / room ✗ / google ✗ → NOT bookable', () => {
    // Neither path. This is the only way to fail the room half now, and it is
    // the state six of seven mentors were in on 5 Sep.
    const d = decideBookability(facts({ hasRoom: false, googleConnected: false }));
    expect(d.bookable).toBe(false);
    expect(d).toMatchObject({ reason: 'no_meeting_room' });
  });

  it('either path satisfies the room half, and neither is required alone', () => {
    // Stated directly because this is the half that has flipped twice.
    // Google alone: fine. A room alone: fine. Neither: not bookable.
    expect(decideBookability(facts({ hasRoom: false, googleConnected: true })).bookable).toBe(true);
    expect(decideBookability(facts({ hasRoom: true, googleConnected: false })).bookable).toBe(true);
    expect(decideBookability(facts({ hasRoom: true, googleConnected: true })).bookable).toBe(true);
    expect(decideBookability(facts({ hasRoom: false, googleConnected: false })).bookable).toBe(false);
  });

  it('availability ✗ / room ✗ / google ✓ → not bookable', () => {
    // Google is NOT independently sufficient. Hours are still required.
    const d = decideBookability(facts({ availability: null, hasRoom: false, googleConnected: true }));
    expect(d.bookable).toBe(false);
    expect(d).toMatchObject({ reason: 'no_availability' });
  });
});

describe('the rule is total and ordered', () => {
  it('switched-off hours are refused before the room is considered', () => {
    const d = decideBookability(facts({ availability: { active: false }, hasRoom: false }));
    expect(d).toMatchObject({ bookable: false, reason: 'not_taking_bookings' });
  });

  it('a null `active` is not an active calendar', () => {
    expect(decideBookability(facts({ availability: { active: null } })).bookable).toBe(false);
  });

  it('every one of the eight fact combinations decides — none falls through', () => {
    for (const availability of [null, { active: true }, { active: false }]) {
      for (const hasRoom of [true, false]) {
        for (const googleConnected of [true, false]) {
          const d = decideBookability({ availability, hasRoom, googleConnected });
          if (d.bookable) expect(typeof d.timezone).toBe('string');
          else expect(['no_availability', 'not_taking_bookings', 'no_meeting_room']).toContain(d.reason);
        }
      }
    }
  });

  it('carries the mentor’s timezone through, defaulting rather than guessing', () => {
    const d = decideBookability(facts({ availability: { active: true, timezone: 'Asia/Dubai' } }));
    expect(d).toMatchObject({ bookable: true, timezone: 'Asia/Dubai' });
    const fallback = decideBookability(facts({ availability: { active: true, timezone: null } }));
    expect(fallback).toMatchObject({ timezone: 'Asia/Kolkata' });
  });
});

// ── AND NOBODY ELSE MAY DECIDE IT ───────────────────────────────────────────
//
// The rule above is worth nothing if a seventh definition can reappear. This
// sweeps the repo for the SHAPES those definitions took — not just the
// function name, because none of the seven shared one.

const SRC = join(process.cwd(), 'src');
const AUTHORITY = 'src/lib/session-assignment.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(full);
  }
  return out;
}

/** Comments stripped — this repo has repeatedly been bitten by guards that matched their own prose. */

const files = walk(SRC)
  .map((f) => [f.slice(process.cwd().length + 1), codeOnly(readFileSync(f, 'utf8'))] as const)
  .filter(([f]) => !f.includes('.test.'));

describe('no second definition of mentor bookability', () => {
  it('the sweep sees the codebase at all', () => {
    expect(files.length).toBeGreaterThan(200);
  });

  it('nobody outside the authority combines a room check with a Google check', () => {
    // The shape shared by video-health, integration-metrics and
    // SessionReadiness: deciding bookability from Google plus a room, without
    // the rule. Each of those was a separate answer to one question.
    const shape = /(google\w*[Cc]onnected|connected\.has\()[^\n]{0,80}&&[^\n]{0,80}(buddy_meet_url|hasRoom)|(buddy_meet_url|hasRoom)[^\n]{0,80}&&[^\n]{0,80}(google\w*[Cc]onnected|connected\.has\()/;
    const offenders = files.filter(([f, c]) => f !== AUTHORITY && shape.test(c)).map(([f]) => f);
    expect(
      offenders,
      'These decide bookability themselves. Call decideBookability() instead:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('nobody derives readiness from onboarding_completed', () => {
    // The admin roster's private definition, which ignored availability
    // entirely and counted an unbookable mentor as having free slots.
    const offenders = files
      .filter(([f, c]) => f !== AUTHORITY && /ready\s*=[^\n]{0,80}buddy_onboarding_completed/.test(c))
      .map(([f]) => f);
    expect(offenders).toEqual([]);
  });

  it('every surface that answers the question imports the authority', () => {
    const consumers = files.filter(([f, c]) => f !== AUTHORITY && /decideBookability|mentorBookability/.test(c));
    expect(consumers.length, 'consolidation removed every consumer — that would be wrong').toBeGreaterThanOrEqual(5);
    for (const [f, c] of consumers) {
      expect(c, `${f} uses the rule without importing it`).toMatch(/from\s+['"](@\/lib\/session-assignment|\.\/session-assignment)['"]/);
    }
  });
});

// ── THE FACT MUST COME FROM SOMETHING THAT IS STILL WRITTEN ─────────────────
//
// 27 Aug, caught before shipping and worth a permanent test.
//
// bookabilityFacts() read `profiles.google_calendar_connected` — a column
// nothing in this codebase has written for weeks. Two other files already
// carry comments saying so, each having been misled by it. It survived because
// the rule was `hasRoom || googleConnected`: a pasted room carried every
// mentor past a fact that was permanently false.
//
// Making Google mandatory removed that cover, and the stale read stopped being
// cosmetic: with the column never set, EVERY mentor would have been unbookable
// forever — including immediately after successfully connecting Google. A
// correct rule reading a dead fact is still a total outage, and the rule looks
// perfect while it happens.
//
// google_oauth_tokens is the only thing that knows: a row exists while the
// connection does, and clearGoogleState() deletes it on disconnect, on revoke
// and on a 401.
describe('the connection fact is read from the token, not a dead column', () => {
  const source = readFileSync('src/lib/session-assignment.ts', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  it('bookabilityFacts asks google_oauth_tokens', () => {
    expect(source).toMatch(/from\(['"]google_oauth_tokens['"]\)/);
  });

  it('bookabilityFacts never reads profiles.google_calendar_connected again', () => {
    expect(
      /google_calendar_connected/.test(source),
      'that column is not written by anything — reading it makes every mentor '
        + 'permanently unbookable, and the rule above will look correct while it does',
    ).toBe(false);
  });
});
