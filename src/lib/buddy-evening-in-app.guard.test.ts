/**
 * ── The evening push is for the students we could not reach any other way ───
 *
 * Founder's call, 15 Sep. NOTIFICATION-OS §10b.1 as law: a notification exists
 * to bring a student back when they are NOT in the app.
 *
 * Measured over 45 days of sends, with opens counted only BEFORE the push so a
 * tap cannot count as having opened first: 379 sends to students already
 * inside the app drew 12 clicks (3.17%); 4,191 to students who had not opened
 * drew 20 (0.48%). This stands down the better-converting slice, which is
 * exactly why the wiring below has to stay honest — the in-app modal has to
 * actually take their place, and the run has to say how many it stood down.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROUTE = join(__dirname, '..', 'app', 'api', 'cron', 'buddy-evening', 'route.ts');
const src = () => readFileSync(ROUTE, 'utf8');
const code = () => src().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('buddy-evening stands down for a student already in the app', () => {
  it('asks who is inside the app, for the whole eligible roster', () => {
    const s = code();
    expect(s).toContain('studentsInsideAppSince');
    expect(s).toMatch(/studentsInsideAppSince\(admin, eligibleIds, todayStart\)/);
  });

  it('skips them before the pitch slot is claimed', () => {
    // A claim is a burned slot. Standing a student down AFTER claiming would
    // consume the one pitch their day has and send nothing with it.
    const s = code();
    const skip = s.indexOf('insideAppToday.has(s.id)');
    const claim = s.indexOf('claimBuddyPitch(');
    expect(skip, 'the in-app skip is missing').toBeGreaterThan(-1);
    expect(skip, 'the skip must come before the claim').toBeLessThan(claim);
  });

  it('treats a failed read as "we could not look", never as "nobody opened"', () => {
    // The helper throws. If this route ever swallows that into an empty set,
    // a bad read becomes a silent full-volume send that nobody notices.
    const s = code();
    expect(s).toMatch(/catch \([\s\S]{0,40}reachReadFailed = true/);
    expect(s).toContain('reach_read_failed: reachReadFailed');
  });

  it('reports how many it stood down, so the swap stays a number', () => {
    // NOTIFICATION-OS §11: a failure only a human notices is unacceptable. If
    // the in-app modal is not picking these students up, this count against a
    // flat `buddy_nudge_shown` is how we find out.
    const s = code();
    expect(s).toMatch(/skippedInApp\+\+/);
    expect(s).toContain('skipped_in_app: skippedInApp');
  });

  it('still respects an explicit opt-out first', () => {
    // Order matters only in one direction: a student who turned push off is
    // never counted as "stood down for the in-app surface".
    const s = code();
    expect(s.indexOf("prefs.push === false")).toBeLessThan(s.indexOf('insideAppToday.has(s.id)'));
  });
});
