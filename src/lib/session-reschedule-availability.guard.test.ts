import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── MOVING A SESSION IS BOOKING IT AGAIN ────────────────────────────────────
 *
 * 27 Aug. calendar/reschedule-meeting wrote a new scheduled_at with no
 * availability check of any kind — a mentor could move a student's session
 * onto a day they do not work, outside their hours, or into their own time
 * off, and nothing refused it.
 *
 * WHY IT SURVIVED, and why this guard is structural rather than a unit test:
 * the rules DID exist, in the database, and looked like they covered the
 * table. Two triggers sit on video_sessions and only one of them reaches an
 * UPDATE —
 *
 *   set_video_session_span                   before insert OR UPDATE OF
 *                                            scheduled_at, ... → the GIST
 *                                            exclusion still refuses a
 *                                            double-booking on a move.
 *   video_session_within_availability_guard  before INSERT only → the mentor's
 *                                            week is never re-read when a
 *                                            session MOVES.
 *
 * Half-covered reads as covered. A unit test on offeredSlotProblem() proves
 * the rule is correct; only a structural test proves the route still CALLS it,
 * which is the half that was missing.
 *
 * Comments are stripped before matching, so the prose above can never satisfy
 * a guard — this repo has been bitten by that at least six times.
 */

const ROOT = join(__dirname, '..');
const REL = 'app/api/calendar/reschedule-meeting/route.ts';

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function read(): string {
  const path = join(ROOT, REL);
  expect(existsSync(path), `${REL} moved — update this guard`).toBe(true);
  return codeOnly(readFileSync(path, 'utf8'));
}

describe('a reschedule re-checks the mentor’s availability', () => {
  it('takes the rule from lib/session-slots instead of restating it', () => {
    // Incident #23: a rule written in N places drifts N−1 times. The mentor's
    // week is defined by generateSlots and nowhere else.
    const code = read();
    expect(code).toMatch(/from\s+['"]@\/lib\/session-slots['"]/);
    expect(code, `${REL} must ask offeredSlotProblem(), not re-derive the week`)
      .toMatch(/\bofferedSlotProblem\s*\(/);
  });

  it('re-reads the mentor’s availability rather than trusting the old row', () => {
    expect(read()).toMatch(/from\(['"]buddy_availability['"]\)/);
  });

  it('excludes the session being moved from its own busy list', () => {
    // Left in, the session blocks every slot inside its own buffer, so a
    // mentor nudging 3pm to 3.30pm is refused by the booking they are holding.
    const code = read();
    expect(code, `${REL} must filter its own row out of the busy spans`)
      .toMatch(/filter\([\s\S]{0,80}!==\s*opts\.sessionId/);
  });

  it('checks BEFORE the calendar move and BEFORE the row is written', () => {
    // Refusing after updateGoogleMeet() would leave the mentor's calendar on a
    // time the app rejected — one meeting, two truths (Incident #17).
    //
    // Scoped to the POST body, and matching a CALL rather than any occurrence
    // of the name. The first draft of this test searched the whole file and so
    // found the function's own DECLARATION, which sits above POST and is
    // therefore earlier than everything — it passed with the check moved after
    // the calendar move, which is the one thing it exists to forbid. Caught by
    // mutation, not by reading it.
    const code = read();
    const postAt = code.search(/export\s+async\s+function\s+POST\s*\(/);
    expect(postAt, 'POST handler not found — update this guard').toBeGreaterThan(-1);
    const post = code.slice(postAt);

    const check = post.search(/(?<!function\s)\brefuseOutsideAvailability\s*\(/);
    const calendar = post.search(/\bupdateGoogleMeet\s*\(/);
    const write = post.search(/\.update\(/);

    expect(check, 'POST never CALLS the availability check').toBeGreaterThan(-1);
    expect(calendar, 'updateGoogleMeet call not found — update this guard').toBeGreaterThan(-1);
    expect(write, 'the scheduled_at update not found — update this guard').toBeGreaterThan(-1);

    expect(check, 'the availability check must run before the calendar is moved')
      .toBeLessThan(calendar);
    expect(check, 'the availability check must run before the session row moves')
      .toBeLessThan(write);
  });

  it('refuses with a 409 the mentor can act on, never a 500', () => {
    // A booking rule the caller can act on is a 409 with a sentence. A 500
    // says "we are broken" and invites a retry that fails the same way forever
    // (lib/booking-constraints).
    expect(read()).toMatch(/reason:\s*outside\.reason\s*\}[\s\S]{0,60}status:\s*409/);
  });
});
