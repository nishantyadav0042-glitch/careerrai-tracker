import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── EVERY PATH THAT BOOKS A SESSION TELLS SOMEBODY ─────────────────────────
 *
 * 27 Aug. /api/sessions/schedule created a session through
 * book_session_credit(), emitted a timeline row, and dispatched nothing. The
 * student who had just paid ₹299 got no notification, and the mentor whose
 * hour had just been taken got none either — `recipient_type 'buddy'` had no
 * dispatch call site anywhere in the codebase.
 *
 * The sibling route had told the student since the Event OS cycle. So the
 * defect was not "we forgot notifications", it was "we covered one of two
 * paths and nothing noticed the other" — which is exactly the failure a
 * structural guard exists to prevent, because the next booking path will be
 * written by someone who never read this incident.
 *
 * THE RULE: a file that moves a video_session into 'scheduled' must also call
 * dispatch(). Not "should" — the whole journey is unobservable without it.
 *
 * Comments are stripped before matching. This repo has been bitten at least
 * six times by a guard that matched its own explanatory prose and passed on a
 * file whose CODE said the opposite; the prose above would do it again.
 */

const ROOT = join(__dirname, '..');

/** Strip // line comments and block comments, so prose can never satisfy a guard. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every route that WRITES session_status: 'scheduled' in real code. */
const BOOKING_ROUTES = [
  'app/api/sessions/schedule/route.ts',
  'app/api/calendar/schedule-meeting/route.ts',
];

describe('every booking path notifies through dispatch()', () => {
  it.each(BOOKING_ROUTES)('%s calls dispatch()', (rel) => {
    const path = join(ROOT, rel);
    expect(existsSync(path), `${rel} moved — update this guard`).toBe(true);
    const code = codeOnly(readFileSync(path, 'utf8'));
    expect(code, `${rel} books a session but never calls dispatch()`).toMatch(/\bdispatch\s*\(/);
  });

  it.each(BOOKING_ROUTES)('%s imports the ONE dispatch authority', (rel) => {
    const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
    expect(code).toMatch(/from\s+['"]@\/lib\/notification-os['"]/);
  });

  it('the student self-serve path tells the BUDDY, not only the student', () => {
    const code = codeOnly(
      readFileSync(join(ROOT, 'app/api/sessions/schedule/route.ts'), 'utf8'),
    );
    // Two dispatch calls: one per human. A single call cannot cover both.
    const calls = code.match(/\bdispatch\s*\(\s*\{/g) ?? [];
    expect(calls.length, 'expected one dispatch for the student and one for the buddy').toBe(2);
    expect(code).toMatch(/userId:\s*opts\.buddyId/);
    expect(code).toMatch(/userId:\s*opts\.studentId/);
  });

  it('the notifier is CALLED on the booking path, not merely defined', () => {
    // Mutation testing caught this guard passing on the defect it exists to
    // stop: deleting the call while leaving the function in place kept
    // `dispatch(` present in the file, so a file-level match was satisfied by
    // dead code. A notifier nothing invokes is precisely what shipped.
    const src = readFileSync(join(ROOT, 'app/api/sessions/schedule/route.ts'), 'utf8');
    const code = codeOnly(src);

    const postAt = code.search(/export\s+async\s+function\s+POST\s*\(/);
    expect(postAt, 'POST handler not found').toBeGreaterThan(-1);
    const post = code.slice(postAt);

    // The success return is the moment the student is told "booked".
    const successAt = post.search(/return\s+NextResponse\.json\(\s*\{\s*ok:\s*true,\s*sessionId,\s*meetUrl/);
    expect(successAt, 'booking success return not found — update this guard').toBeGreaterThan(-1);

    // Somewhere between entering POST and answering "booked", both humans are
    // told. Matching a CALL — an identifier followed by `(` that is not a
    // declaration — so a definition alone can never satisfy it.
    const beforeSuccess = post.slice(0, successAt);
    expect(
      /(?<!function\s)\btellBothParties\s*\(/.test(beforeSuccess),
      'POST books a session and returns success without notifying anyone',
    ).toBe(true);
  });

  it('notification failure can never fail a committed booking', () => {
    const code = codeOnly(
      readFileSync(join(ROOT, 'app/api/sessions/schedule/route.ts'), 'utf8'),
    );
    // The dispatches sit inside a try/catch that logs. Silent would be a
    // different defect; fatal would reject a session that already exists.
    expect(code).toMatch(/catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,200}console\.error/);
  });

  it('booking copy lives in ONE module so the two paths cannot drift', () => {
    for (const rel of BOOKING_ROUTES) {
      const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
      expect(code, `${rel} should import its wording from lib/session-link`)
        .toMatch(/from\s+['"]@\/lib\/session-link['"]/);
    }
  });
});
