import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ── A live session must not disappear from the people in it ────────────────
//
// 24 Aug. Adding the mentor's Start button moved a session from `scheduled` to
// `active` — and EVERY surface that showed the Join button filtered on
// `session_status = 'scheduled'` alone. The button would have vanished from
// the student's screen at the exact instant the call began, and the mentor's
// close-out would have lost the sessionId it needs to complete the session.
//
// This is the 4 Aug grace-window incident in a new costume: that one made the
// row vanish at T+0, this one at Start. The lesson both times is the same — a
// surface that shows a LIVE session must define "live" as every state a live
// session can be in, not as the one it starts in.
//
// The guard DISCOVERS surfaces rather than listing them, because a hardcoded
// list only protects what its author remembered — a mistake already made once
// in this repo's session work.

/** Surfaces that legitimately mean "booked, not yet begun". */
const NOT_JOIN_SURFACES = [
  // Tomorrow's reminder. A session already running is not tomorrow's.
  'src/app/api/cron/session-tomorrow/route.ts',
];

function surfaces(): string[] {
  const out = execSync(
    `grep -rl "session_status" src/app --include=*.ts --include=*.tsx || true`,
    { encoding: 'utf8' },
  ).split('\n').filter(Boolean);
  return out.filter((f) => !f.includes('.test.'));
}

describe('every surface that reads a live session includes active', () => {
  const files = surfaces();

  it('found session surfaces at all — an empty sweep would pass vacuously', () => {
    expect(files.length).toBeGreaterThanOrEqual(5);
  });

  it.each(files)('%s does not filter to scheduled-only', (file) => {
    if (NOT_JOIN_SURFACES.includes(file)) return;
    const src = readFileSync(file, 'utf8');

    // The exact shape that caused the bug: an equality filter pinning the
    // query to the one state a session begins in.
    const scheduledOnly = /\.eq\(\s*['"]session_status['"]\s*,\s*['"]scheduled['"]\s*\)/.test(src);

    expect(
      scheduledOnly,
      `${file} filters session_status = 'scheduled' only. If this surface shows a `
      + `joinable or in-progress session, a started call vanishes from it. Use `
      + `.in('session_status', ['scheduled','active']), or add the file to `
      + `NOT_JOIN_SURFACES with a reason if it genuinely means "booked, not begun".`,
    ).toBe(false);
  });
});

describe('the close-out can still reach a session it started', () => {
  it('the mentor cockpit loader accepts active sessions', () => {
    // Without this the mentor presses Start, the card re-renders, nextSession
    // is null, and CallCloseout receives sessionId={null} — so the session can
    // never be completed and the ₹299 product is undeliverable again.
    const loader = readFileSync('src/app/buddy/(dashboard)/students/[id]/page.tsx', 'utf8');
    expect(loader).toMatch(/\.in\('session_status', \['scheduled', 'active'\]\)/);
  });

  it('the student still sees a session the mentor has started', () => {
    for (const f of ['src/app/student/tracker/page.tsx', 'src/app/student/buddy/page.tsx']) {
      expect(readFileSync(f, 'utf8'), `${f} drops the student's live session`)
        .toMatch(/\.in\('session_status', \['scheduled', 'active'\]\)/);
    }
  });
});

describe('Start is the mentor’s act, gated to the real call window', () => {
  const COCKPIT = readFileSync('src/components/buddy/cockpit.tsx', 'utf8');
  const START = readFileSync('src/components/buddy/session-start.tsx', 'utf8');

  it('Start is gated on the same window as Join', () => {
    // A mentor who could mark a call live three hours early would make
    // started_at worthless as evidence that the call happened.
    expect(COCKPIT).toMatch(/canJoinNow\(sessionJoinState\) \|\| p\.nextSession\.session_status === 'active'/);
  });

  it('the client never sends started_at — the database owns the clock', () => {
    expect(START).not.toMatch(/started_at:/);
    expect(START).toMatch(/sessionId/);
  });

  it('a second tap reads as success, not as a failure', () => {
    // Two tabs, or a double tap. The session is running either way; showing an
    // error would send a mentor chasing a problem that does not exist.
    expect(START).toMatch(/alreadyStarted is a SUCCESS/i);
  });

  it('an already-started session shows as live rather than offering Start again', () => {
    expect(START).toMatch(/status === 'active'/);
    expect(START).toMatch(/Live/);
  });

  it('Start is offered ONLY for a scheduled session', () => {
    expect(START).toMatch(/if \(status !== 'scheduled'\) return null;/);
  });
});
