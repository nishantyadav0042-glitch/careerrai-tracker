import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── EVERY BOOKED SESSION REACHES THE MENTOR'S CALENDAR ──────────────────────
 *
 * 27 Aug. createCalendarHold() had exactly one caller: the student self-serve
 * route. calendar/schedule-meeting — the path a mentor uses to book for their
 * own student — created the session, sent the notification, and never touched
 * Google. So for half of all bookings:
 *
 *   · the mentor's hour was not blocked, and they could give it away
 *   · the student was never an attendee, so Google sent no invite and no
 *     reminder
 *   · no google_event_id was stored, so cancel and reschedule had nothing to
 *     act on
 *
 * NOTHING ERRORED. Every symptom was an absence — the session existed, the
 * link worked, and the calendar half simply did not happen. That is the same
 * shape as the notification defect on this very route: one of two doors
 * covered, and nothing noticing the other.
 *
 * So the rule is structural, not behavioural. A behaviour test proves today's
 * two routes both call it; this proves that a THIRD booking path cannot be
 * written without one, and that neither existing path can quietly drop it.
 *
 * Comments are stripped before matching, so the prose above can never satisfy
 * an assertion below.
 */

const ROOT = join(__dirname, '..');

function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/** Every route that creates a video_sessions row a human will attend. */
const BOOKING_ROUTES = [
  'app/api/sessions/schedule/route.ts',
  'app/api/calendar/schedule-meeting/route.ts',
];

describe('both booking doors put the session on the calendar', () => {
  it.each(BOOKING_ROUTES)('%s exists — the guard is checking, not skipping', (rel) => {
    expect(existsSync(join(ROOT, rel)), `${rel} moved — update this guard`).toBe(true);
  });

  it.each(BOOKING_ROUTES)('%s calls the shared calendar holder', (rel) => {
    const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
    expect(code, `${rel} must import lib/session-calendar`)
      .toMatch(/from\s+['"]@\/lib\/session-calendar['"]/);
    // A CALL, not merely an import — matching an identifier followed by `(`
    // that is not a declaration, so a dead import cannot satisfy it.
    expect(
      /(?<!function\s)\bholdTheMentorsHour\s*\(/.test(code),
      `${rel} books a session and never puts it on the mentor's calendar`,
    ).toBe(true);
  });

  it('there is ONE implementation, and the routes do not re-implement it', () => {
    // The defect was a private copy living inside one route. If a route calls
    // createCalendarHold directly again, the two doors can diverge exactly as
    // they did before.
    for (const rel of BOOKING_ROUTES) {
      const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
      expect(
        /\bcreateCalendarHold\s*\(/.test(code),
        `${rel} calls createCalendarHold directly — go through lib/session-calendar`,
      ).toBe(false);
    }
  });

  it('lib/session-calendar is the only caller of createCalendarHold', () => {
    const callers: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name)) {
          const c = codeOnly(readFileSync(p, 'utf8'));
          if (/\bcreateCalendarHold\s*\(/.test(c)) callers.push(p.replace(`${ROOT}/`, ''));
        }
      }
    };
    walk(ROOT);
    // The definition itself plus the one authority that calls it.
    expect(callers.sort()).toEqual(['lib/google-meet.ts', 'lib/session-calendar.ts']);
  });

  it('the hold can never fail the booking that already happened', () => {
    // By the time it runs the credit is spent and the session exists. A
    // calendar outcome that could change the student's answer would be the
    // fatal-notification defect wearing a calendar hat.
    const src = codeOnly(readFileSync(join(ROOT, 'lib/session-calendar.ts'), 'utf8'));
    expect(src).toMatch(/\btry\s*\{/);
    expect(
      /catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,200}console\.error/.test(src),
      'session-calendar must catch and LOG, never rethrow into a booking route',
    ).toBe(true);
    expect(src, 'it must return void, so no caller can branch on the outcome')
      .toMatch(/Promise<void>/);
  });

  it('the student is carried as an attendee, which is what sends the invite', () => {
    // The reminder path is not "we connected Google". It is: an email becomes
    // an attendee, and createCalendarHold posts with sendUpdates=all so Google
    // itself delivers the invitation and its default reminders. Drop the
    // email and the student silently gets nothing.
    const src = codeOnly(readFileSync(join(ROOT, 'lib/session-calendar.ts'), 'utf8'));
    expect(src).toMatch(/studentEmail:/);
    expect(src).toMatch(/select\(['"]full_name, email['"]\)/);

    const meet = codeOnly(readFileSync(join(ROOT, 'lib/google-meet.ts'), 'utf8'));
    expect(meet, 'the hold must invite the attendee').toMatch(/sendUpdates=all/);
    expect(meet, 'the hold must carry calendar reminders').toMatch(/reminders:\s*\{\s*useDefault:\s*true\s*\}/);
  });
});
