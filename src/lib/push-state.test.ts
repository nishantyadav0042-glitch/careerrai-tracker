import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  pushHealth, needsPushRepair, daysSinceReminderStopped, PUSH_REPAIR_COPY,
} from './push-state';

// Measured on the live database, 9 Aug 2026 — the numbers these tests exist for:
//
//   push LIVE   58 students · 52% have ever logged · 3.1 logs each
//   push DEAD   42 students · 31% have ever logged · 1.3 logs each
//   never on   158 students · 18% have ever logged · 1.7 logs each
//
// Two things follow. Push is load-bearing — students holding a live
// subscription log at roughly three times the rate of those without one. And 42
// students who explicitly asked for reminders were getting none, for an average
// of 18 days, while the profile screen showed them a toggle switched ON.
//
// That last part was the defect: the toggle read `notif_prefs.push`, which is
// what the student ASKED for, and called it what the student HAS.

const LIVE = { prefWantsPush: true, hasSubscription: true, diedAt: null };
const DEAD = { prefWantsPush: true, hasSubscription: false, diedAt: '2026-07-22T04:00:00Z' };

describe('a preference is not a subscription', () => {
  it('calls it broken when they asked for reminders and cannot receive them', () => {
    expect(pushHealth(DEAD)).toBe('broken');
    expect(needsPushRepair(DEAD)).toBe(true);
  });

  it('is healthy only when the want and the subscription agree', () => {
    expect(pushHealth(LIVE)).toBe('healthy');
    expect(needsPushRepair(LIVE)).toBe(false);
  });

  it('flags a missing subscription even when no death was ever recorded', () => {
    // The silent case, and the reason `broken` does not require `diedAt`: a
    // persist that failed during onboarding, cleared site data, or a WebAPK
    // install that replaced the tab endpoint before any send was attempted.
    // The student asked for reminders and is not getting them either way.
    expect(pushHealth({ prefWantsPush: true, hasSubscription: false, diedAt: null })).toBe('broken');
  });

  it('never nags someone who turned reminders off', () => {
    expect(pushHealth({ prefWantsPush: false, hasSubscription: false, diedAt: '2026-07-01T00:00:00Z' }))
      .toBe('off_by_choice');
    // A live endpoint left over from before they opted out is not consent.
    expect(pushHealth({ prefWantsPush: false, hasSubscription: true, diedAt: null })).toBe('off_by_choice');
    expect(needsPushRepair({ prefWantsPush: false, hasSubscription: true, diedAt: null })).toBe(false);
  });

  it('distinguishes "never asked" from "turned it off"', () => {
    // 158 students have never enabled push. That is an ask we have not won,
    // not a fault to repair, and it must never render as an error state.
    expect(pushHealth({ prefWantsPush: false, hasSubscription: false, diedAt: null })).toBe('never_enabled');
    expect(needsPushRepair({ prefWantsPush: false, hasSubscription: false, diedAt: null })).toBe(false);
  });
});

describe('how long they have been missing reminders', () => {
  it('counts whole days from the recorded death', () => {
    expect(daysSinceReminderStopped('2026-07-22T04:00:00Z', '2026-08-09T04:00:00Z')).toBe(18);
  });

  it('says nothing rather than guessing when no death was recorded', () => {
    // A number the student can disprove costs more than it buys.
    expect(daysSinceReminderStopped(null, '2026-08-09T04:00:00Z')).toBeNull();
  });

  it('never shows zero or a negative day count', () => {
    expect(daysSinceReminderStopped('2026-08-09T04:00:00Z', '2026-08-09T06:00:00Z')).toBeNull();
    expect(daysSinceReminderStopped('2026-08-10T04:00:00Z', '2026-08-09T04:00:00Z')).toBeNull();
  });

  it('survives a malformed timestamp instead of rendering NaN', () => {
    expect(daysSinceReminderStopped('not-a-date', '2026-08-09T04:00:00Z')).toBeNull();
  });
});

describe('the repair copy never blames the student', () => {
  it('states the loss, not the technology', () => {
    const all = `${PUSH_REPAIR_COPY.title} ${PUSH_REPAIR_COPY.body} ${PUSH_REPAIR_COPY.cta}`.toLowerCase();
    expect(all).toContain('reminders');
    // "Push subscription" and "notification permission" are our words, not theirs.
    expect(all).not.toContain('subscription');
    expect(all).not.toContain('endpoint');
    // Nothing that reads as the student's mistake.
    expect(all).not.toMatch(/you (didn't|did not|failed|forgot)/);
    expect(PUSH_REPAIR_COPY.body.toLowerCase()).toContain('nothing on your side');
  });
});

describe('the toggle reads the truth, not the wish', () => {
  it('the profile toggle is driven by the real subscription state', () => {
    // The regression this guards: `initialEnabled={prefs.push ?? false}` showed
    // 42 students an ON switch while they received nothing for 18 days.
    const overview = readFileSync('src/app/student/profile/profile-overview.tsx', 'utf8');
    expect(overview).toContain('pushHealth');
    expect(overview).not.toMatch(/initialEnabled=\{prefs\.push/);
  });

  it('the layout decides with the same helper, not a hand-rolled condition', () => {
    // Deliberately NOT a second repair banner. StandaloneNotifAsk already
    // catches the reconnect case on every open of the installed app, and the
    // browser-tab silence is a decision, not an oversight: browser-context
    // subscriptions were measured dying at ~75% against ~8% for installed-app
    // ones, so we mint them nowhere else. A fourth surface would fight that.
    //
    // What the layout owed us was one vocabulary. It open-coded
    // `!pushEnabled || !profile?.push_subscription`, which is the same rule the
    // profile screen got wrong — and a rule spelled out in two places is how it
    // drifts in the first place.
    const layout = readFileSync('src/app/student/layout.tsx', 'utf8');
    expect(layout).toContain('pushHealth');
    expect(layout).not.toContain('!pushEnabled || !profile?.push_subscription');
  });
});
