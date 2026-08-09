import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  joinState, canJoinNow, shouldShowLink, countdownLabel,
  bookedNotificationBody, reminderNotificationBody, sessionNotificationUrl,
  JOIN_OPENS_MINUTES_BEFORE, JOIN_STAYS_OPEN_MINUTES_AFTER,
} from './session-link';

// Written against a real failure: Shreya Bendigeri's only two sessions, both
// with our only paying student, both with a working link, both EXPIRED with
// nobody joining.

const START = '2026-08-14T16:30:00.000Z'; // 22:00 IST
const at = (minsFromStart: number, hasLink = true) =>
  joinState({ scheduledAtIso: START, nowMs: Date.parse(START) + minsFromStart * 60_000, hasLink });

describe('the link is visible from the moment it is booked', () => {
  it('shows the link four hours before, even though the button is not live', () => {
    // THE FIX. The old gate was `minsAway <= 15`: a student opening the app at
    // 18:00 for a 22:00 session saw "in 4h" and no link at all — nothing to
    // copy, nothing to put in their own calendar, nothing to test.
    const s = at(-240);
    expect(s).toBe('scheduled');
    expect(shouldShowLink(s), 'a booked session must always show its room').toBe(true);
    expect(canJoinNow(s)).toBe(false);
  });

  it('only hides the link when there is genuinely no room', () => {
    expect(shouldShowLink(at(-10, false))).toBe(false);
    expect(at(-10, false)).toBe('no_link');
  });
});

describe('the join window is wide enough to be useful', () => {
  it('opens well before the hour, not at the last minute', () => {
    expect(JOIN_OPENS_MINUTES_BEFORE).toBeGreaterThanOrEqual(30);
    expect(canJoinNow(at(-JOIN_OPENS_MINUTES_BEFORE + 1))).toBe(true);
    expect(canJoinNow(at(-JOIN_OPENS_MINUTES_BEFORE - 5))).toBe(false);
  });

  it('stays open long after the start, because people run late', () => {
    // A mentor sitting alone in a room is worse than a student joining late.
    expect(at(20)).toBe('live');
    expect(canJoinNow(at(JOIN_STAYS_OPEN_MINUTES_AFTER - 5))).toBe(true);
    expect(at(JOIN_STAYS_OPEN_MINUTES_AFTER + 5)).toBe('ended');
    expect(canJoinNow(at(JOIN_STAYS_OPEN_MINUTES_AFTER + 5))).toBe(false);
  });

  it('is exactly joinable at the start minute', () => {
    expect(at(0)).toBe('joinable');
  });
});

describe('the countdown says something true at every distance', () => {
  it('reads naturally from days out to live', () => {
    const now = (m: number) => ({ scheduledAtIso: START, nowMs: Date.parse(START) + m * 60_000 });
    expect(countdownLabel(now(-2880))).toBe('in 2d');
    expect(countdownLabel(now(-240))).toBe('in 4h');
    expect(countdownLabel(now(-25))).toBe('in 25m');
    expect(countdownLabel(now(0))).toBe('starts now');
    expect(countdownLabel(now(10))).toBe('live now');
  });

  it('never renders a negative or NaN countdown', () => {
    expect(countdownLabel({ scheduledAtIso: 'nonsense', nowMs: Date.now() })).toBe('');
    for (const m of [-5000, -1, 0, 1, 5000]) {
      const label = countdownLabel({ scheduledAtIso: START, nowMs: Date.parse(START) + m * 60_000 });
      expect(label).not.toContain('-');
      expect(label).not.toContain('NaN');
    }
  });
});

describe('the notification carries the room, not directions to it', () => {
  it('puts the link in the booking message', () => {
    const body = bookedNotificationBody({
      istTime: '10:00 pm', isOrientation: false, meetLink: 'https://meet.google.com/vtd-avxq-gyj',
    });
    expect(body).toContain('https://meet.google.com/vtd-avxq-gyj');
    expect(body.toLowerCase(), 'do not send them hunting for a dashboard')
      .not.toContain('from your dashboard');
  });

  it('puts the link in the day-before reminder too', () => {
    const body = reminderNotificationBody({
      istTime: '10:00 pm', title: 'CareerRai: Shreya × Vedashri', meetLink: 'https://meet.google.com/x',
    });
    expect(body).toContain('https://meet.google.com/x');
    expect(body).toContain('10:00 pm');
  });

  it('degrades honestly when there is no room yet', () => {
    const body = bookedNotificationBody({ istTime: '10:00 pm', isOrientation: true, meetLink: null });
    expect(body).not.toContain('Join here');
    expect(body).toContain('10:00 pm');
  });

  it('lands each role somewhere they can act', () => {
    // The booking notification shipped with NO url, so a tap opened whatever
    // the app happened to be showing.
    expect(sessionNotificationUrl('student')).toMatch(/^\//);
    expect(sessionNotificationUrl('buddy')).toMatch(/^\//);
    expect(sessionNotificationUrl('student')).not.toBe(sessionNotificationUrl('buddy'));
  });
});

describe('every session surface uses this one decision', () => {
  it('the student strip no longer hand-rolls a 15-minute gate', () => {
    const src = readFileSync('src/components/DailyTracker/DailyTrackerApp.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src, 'the join gate must come from session-link').not.toMatch(/minsAway\s*<=\s*15/);
    expect(src).toContain('session-link');
  });

  it('the buddy cockpit uses it too, so both sides open together', () => {
    // The two sides opening at different moments is how one person ends up
    // alone in a room wondering if the other is coming.
    const src = readFileSync('src/components/buddy/cockpit.tsx', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(src, 'the buddy join gate must come from session-link').not.toMatch(/minsAway\s*<=\s*15/);
    expect(src).toContain('session-link');
  });
});

describe('a session leaves the schedule an hour after it starts', () => {
  it('stops being joinable at exactly the release hour', () => {
    // Founder, 9 Aug: one hour after the session time it is removed from the
    // schedule so the mentor can book another. The joinable window and the
    // release window are the SAME hour on purpose — a row you can neither
    // join nor replace is the worst of both.
    expect(JOIN_STAYS_OPEN_MINUTES_AFTER).toBe(60);
    expect(at(59)).toBe('live');
    expect(at(61)).toBe('ended');
  });

  it('derives its timings from session-window, never its own copy', () => {
    // session-window exists because on 4 Aug the student's app and the
    // mentor's app answered "is this happening" differently, and she joined an
    // empty room. A second copy of these numbers recreates that exactly.
    const src = readFileSync('src/lib/session-link.ts', 'utf8');
    expect(src).toContain("from './session-window'");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code, 'a hard-coded minute count is a second source of truth')
      .not.toMatch(/JOIN_STAYS_OPEN_MINUTES_AFTER\s*=\s*\d/);
    expect(code).not.toMatch(/JOIN_OPENS_MINUTES_BEFORE\s*=\s*\d/);
  });

  it('the release cron applies that one rule, with no extra delay stacked on', () => {
    const cron = readFileSync('src/app/api/cron/release-stale-sessions/route.ts', 'utf8');
    expect(cron).toContain('RELEASE_AFTER_MS');
    const code = cron.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code, 'the old six-hour constant is gone').not.toContain('STALE_AFTER_HOURS');
    // The bug being prevented: `end` already included the duration, and the
    // filter then added the stale window on top — 6 hours became up to 12.
    expect(code).not.toMatch(/duration_minutes[^\n]*RELEASE_AFTER_MS/);
  });
});

describe('a mentor who hits a scheduling error is never stuck', () => {
  const modal = readFileSync('src/components/schedule-session-modal.tsx', 'utf8');

  it('offers them their own Meet room rather than a dead end', () => {
    expect(modal).toContain('meet.google.com/new');
    expect(modal).toContain('meetingLink');
    expect(modal.toLowerCase()).toContain('new meeting');
  });

  it('the guidance appears WITH the error, not somewhere else', () => {
    // A workaround the mentor has to go hunting for is a workaround that does
    // not get used at 6:28pm with a student waiting.
    const firstErrorBlock = modal.indexOf('{error && (');
    const guidance = modal.indexOf('start your own Meet');
    expect(guidance).toBeGreaterThan(-1);
    expect(Math.abs(guidance - firstErrorBlock)).toBeLessThan(600);
  });
});
