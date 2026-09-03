import { describe, it, expect } from 'vitest';
import { journeyStage, messageFor, JOURNEY_NEXT_STEP } from './sales-messages';
import type { DueReason } from './call-queue';

// ── The journey decides the ask; the lane decides the opening ───────────────

describe('journeyStage — install → notifications → daily log', () => {
  it('not installed outranks everything', () => {
    expect(journeyStage({ appInstalled: false, pushSubscribed: true, pushDied: false, daysSinceLastLog: 0 })).toBe('not_installed');
  });
  it('installed, reminders died → push_died before notifications_off', () => {
    expect(journeyStage({ appInstalled: true, pushSubscribed: false, pushDied: true, daysSinceLastLog: null })).toBe('push_died');
  });
  it('installed, never subscribed → notifications_off', () => {
    expect(journeyStage({ appInstalled: true, pushSubscribed: false, pushDied: false, daysSinceLastLog: null })).toBe('notifications_off');
  });
  it('installed and subscribed: logging within 7 days, else not_logging', () => {
    expect(journeyStage({ appInstalled: true, pushSubscribed: true, pushDied: false, daysSinceLastLog: 3 })).toBe('logging');
    expect(journeyStage({ appInstalled: true, pushSubscribed: true, pushDied: false, daysSinceLastLog: 12 })).toBe('not_logging');
    expect(journeyStage({ appInstalled: true, pushSubscribed: true, pushDied: false, daysSinceLastLog: null })).toBe('not_logging');
  });
  it('every stage names exactly one next step', () => {
    for (const v of Object.values(JOURNEY_NEXT_STEP)) expect(v.length).toBeGreaterThan(10);
  });
});

describe('messageFor — one message per lane and stage', () => {
  const lanes: DueReason[] = ['callback', 'retry', 'followup', 'checkout_abandoned', 'going_cold', 'broken_streak', 'new_never_logged', 'conversion', 'attention', 'fresh', 'rotation'];

  it('every lane produces a message that names the student and the counsellor', () => {
    for (const lane of lanes) {
      const m = messageFor({ firstName: 'Riya', repFirstName: 'Anshul', lane, stage: 'not_logging', daysSilent: 30 });
      expect(m, lane).toContain('Riya');
      expect(m, lane).toContain('Anshul');
      expect(m.length, lane).toBeLessThan(400);
    }
  });

  it('the ask follows the journey stage, not the lane', () => {
    const notInstalled = messageFor({ firstName: 'Riya', repFirstName: 'Neelam', lane: 'attention', stage: 'not_installed', daysSilent: null });
    expect(notInstalled).toMatch(/install/i);
    expect(notInstalled).toContain('https://careerrai.in');
    const noPush = messageFor({ firstName: 'Riya', repFirstName: 'Neelam', lane: 'attention', stage: 'notifications_off', daysSilent: null });
    expect(noPush).toMatch(/notifications/i);
    const notLogging = messageFor({ firstName: 'Riya', repFirstName: 'Neelam', lane: 'rotation', stage: 'not_logging', daysSilent: 25 });
    expect(notLogging).toMatch(/log/i);
  });

  it('rotation says how long it has been, and never pitches', () => {
    const m = messageFor({ firstName: 'Riya', repFirstName: 'Neelam', lane: 'rotation', stage: 'not_logging', daysSilent: 25 });
    expect(m).toContain('25 days');
    expect(m).not.toMatch(/₹|session|pay/i);
  });

  it('money and buddy lanes are the only ones that mention the session', () => {
    for (const lane of lanes) {
      const m = messageFor({ firstName: 'Riya', repFirstName: 'Neelam', lane, stage: 'logging', daysSilent: 1 });
      // "study session" is the student's, not ours — the pitch words are the
      // rupee sign, "buddy session" and "single session".
      const mentions = /₹|buddy session|single session/i.test(m);
      expect(mentions, lane).toBe(lane === 'checkout_abandoned' || lane === 'conversion');
    }
  });

  it('never claims a plan is ready or that they studied — nothing the card cannot prove', () => {
    for (const lane of lanes) {
      const m = messageFor({ firstName: 'Riya', repFirstName: 'Neelam', lane, stage: null, daysSilent: null });
      expect(m, lane).not.toMatch(/plan is ready|tumhara plan|you studied \d/i);
    }
  });
});
