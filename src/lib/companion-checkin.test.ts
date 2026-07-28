import { describe, it, expect } from 'vitest';
import { missedCheckInKickoffCopy } from './companion';

// The 08:00 morning check-in nudge. It exists because yesterday has no entry —
// a STATE, not because a cron fired (Notification OS §2.6). These tests guard
// the two things that make it worth sending: it must not shame, and it must not
// claim anything untrue.

describe('the morning check-in nudge', () => {
  const copy = missedCheckInKickoffCopy('27 Jul', 'DILR');

  it('never shames the student', () => {
    // Same banned list the check-in gate copy is held to. A student who did not
    // log yesterday is not late and has not failed — one answer is outstanding,
    // that is all. The moment this reads as an accusation, honest answers stop.
    const text = `${copy.title} ${copy.body}`.toLowerCase();
    for (const banned of [
      'must', 'required', 'mandatory', 'failed', 'missed', 'lazy', 'excuse',
      'forgot', "didn't log", 'break your', 'losing', 'behind',
    ]) {
      expect(text, `copy contains "${banned}"`).not.toContain(banned);
    }
  });

  it('names the real date and the real weakest section', () => {
    // Specificity is the whole point — a generic morning greeting is what this
    // replaces (621 sends, 2 logs).
    expect(copy.body).toContain('27 Jul');
    expect(copy.body).toContain('DILR');
  });

  it('asks for the log, not a generic app open', () => {
    // expectedAction drives outcome attribution on /admin/notification-health.
    // Mislabelling it as open_plan would credit this nudge for the wrong thing.
    expect(copy.expectedAction).toBe('log_today');
  });

  it('promises only what the engine actually does', () => {
    // The claim "today rebuilds around it" is true: /api/routine/today
    // recomputes from the check-in and plan-reason.ts names what changed. It
    // must never promise a NEW plan, a score, or a guarantee — none of which
    // this answer produces.
    const text = `${copy.title} ${copy.body}`.toLowerCase();
    for (const overclaim of ['guarantee', 'guaranteed', 'percentile', 'brand new plan', 'double']) {
      expect(text, `copy overclaims with "${overclaim}"`).not.toContain(overclaim);
    }
    expect(text).toMatch(/rebuild|today/);
  });

  it('stays short enough to survive a notification tray', () => {
    // Android/iOS truncate hard; a reason the student cannot read is not a reason.
    expect(copy.title.length).toBeLessThanOrEqual(48);
    expect(copy.body.length).toBeLessThanOrEqual(140);
  });
});
