import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';
import { holdSessionOnCalendar } from './session-calendar';

/**
 * ── EVERY BOOKING PATH REACHES GOOGLE CALENDAR THE SAME WAY ─────────────────
 *
 * 28 Aug. A session could be booked two ways and only one told Google.
 * /api/sessions/schedule placed a BUSY hold and stored its event id;
 * /api/calendar/schedule-meeting made zero Calendar calls. The rest of the
 * lifecycle assumes the event exists — reschedule moves `google_event_id`,
 * cancel deletes it — so a mentor-created booking had nothing to move and
 * nothing to delete, and the mentor's hour never showed as busy.
 *
 * It cost nothing only because google_oauth_tokens has been empty for the
 * product's entire life. The moment one mentor connects, the paths diverge.
 *
 * Comments are stripped before matching. The prose above names every symbol
 * being asserted, and this repo has repeatedly shipped guards that matched
 * their own explanation.
 */

const ROOT = join(__dirname, '..');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every route that moves a video_session into 'scheduled'. */
const BOOKING_ROUTES = [
  'app/api/sessions/schedule/route.ts',
  'app/api/calendar/schedule-meeting/route.ts',
];

describe('both booking paths hold the mentor’s calendar', () => {
  it.each(BOOKING_ROUTES)('%s exists', (rel) => {
    expect(existsSync(join(ROOT, rel)), `${rel} moved — update this guard`).toBe(true);
  });

  it.each(BOOKING_ROUTES)('%s REACHES holdSessionOnCalendar on the booking path', (rel) => {
    const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));

    // Mutation testing caught the first version of this assertion passing on
    // `if (false) await holdSessionOnCalendar(...)` — the call text was present
    // and the guard was satisfied by dead code, which is precisely the defect
    // shape it exists to stop (a route that books and reaches Google nowhere).
    //
    // Two things are required now. The call must be a STATEMENT — `await` at
    // the start of its own line, so no same-line condition can disable it. And
    // it must sit INSIDE the POST handler, ahead of the success return, so it
    // cannot drift into a helper nothing invokes.
    const postAt = code.search(/export\s+async\s+function\s+POST\s*\(/);
    expect(postAt, `${rel}: POST handler not found — update this guard`).toBeGreaterThan(-1);
    const post = code.slice(postAt);

    // The LAST such return, not the first. sessions/schedule answers
    // `{ ok: true, ..., already: true }` early for an idempotent replay, long
    // before a hold is placed — anchoring on that one made this assertion fail
    // against correct code.
    const successes = [...post.matchAll(/return\s+NextResponse\.json\(\s*(?:payload|\{\s*ok:\s*true)/g)];
    expect(successes.length, `${rel}: success return not found — update this guard`).toBeGreaterThan(0);
    const successAt = successes[successes.length - 1].index!;

    expect(
      /(?:^|\n)\s*await\s+holdSessionOnCalendar\s*\(/.test(post.slice(0, successAt)),
      `${rel} books a session but never places a calendar hold before answering `
      + 'success. Reschedule and cancel both key off google_event_id, so a booking '
      + 'without a hold leaves them nothing to move or delete — and the mentor can '
      + 'give the same slot away. A call behind a disabled branch does not count.',
    ).toBe(true);
  });

  it.each(BOOKING_ROUTES)('%s imports the ONE calendar authority', (rel) => {
    const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
    expect(code).toMatch(/from\s+['"]@\/lib\/session-calendar['"]/);
  });

  it('no booking route calls createCalendarHold directly any more', () => {
    // The inline implementation in sessions/schedule was the reason the sibling
    // route never got one: there was nothing shared to call.
    for (const rel of BOOKING_ROUTES) {
      const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
      expect(
        code,
        `${rel} should go through lib/session-calendar, not build its own hold`,
      ).not.toMatch(/\bcreateCalendarHold\s*\(/);
    }
  });

  it('lib/session-calendar is the only non-test caller of createCalendarHold', () => {
    const hits = execSyncLike();
    expect(
      hits,
      'a second calendar-hold implementation appeared; there must be exactly one',
    ).toEqual(['lib/session-calendar.ts']);
  });
});

/** Files under src/ that CALL createCalendarHold, excluding tests and the lib itself. */
function execSyncLike(): string[] {
  const out = execSync(
    `grep -rl "createCalendarHold(" src --include=*.ts --include=*.tsx || true`,
    { encoding: 'utf8' },
  ).split('\n').filter(Boolean);
  return out
    .filter((f) => !f.includes('.test.'))
    .filter((f) => !f.endsWith('src/lib/google-meet.ts')) // its definition
    // grep -l matches raw bytes, so a COMMENT naming createCalendarHold() was
    // reported as a second implementation (student/buddy/page.tsx explains, in
    // prose, that the hold adds the student as an attendee). Re-check each hit
    // against comment-stripped source, the same rule every other assertion in
    // this file uses: an implementation is a CALL, never a sentence about one.
    .filter((f) => /\bcreateCalendarHold\s*\(/.test(codeOnly(readFileSync(f, 'utf8'))))
    .map((f) => f.replace(/^src\//, ''))
    .sort();
}

describe('holdSessionOnCalendar never lets Google cost someone a booking', () => {
  const admin = (opts: { profile?: unknown; updateError?: { message: string } } = {}) => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: opts.profile ?? null }) }) }),
      update: () => ({ eq: async () => ({ error: opts.updateError ?? null }) }),
    }),
  });

  const base = {
    sessionId: 's1', studentId: 'stu', buddyId: 'bud',
    startIso: '2026-09-01T10:00:00.000Z', durationMinutes: 45, meetUrl: 'https://meet/x',
  };

  it('reports not-held rather than throwing when Google is unreachable', async () => {
    // No mentor has ever connected Google, so createCalendarHold answers
    // 'not_connected' every time today. That must never surface as an error to
    // a student who already holds a real, committed booking.
    const res = await holdSessionOnCalendar(admin() as never, base);
    expect(res.held).toBe(false);
    expect(res).toHaveProperty('reason');
  });

  it('never throws even when the database read itself explodes', async () => {
    const exploding = { from: () => { throw new Error('connection lost'); } };
    await expect(holdSessionOnCalendar(exploding as never, base)).resolves.toMatchObject({
      held: false,
    });
  });
});
