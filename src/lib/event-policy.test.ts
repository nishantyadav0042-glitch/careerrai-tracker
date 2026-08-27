import { describe, it, expect } from 'vitest';
import {
  chooseChannels, policyFor, isPaidChannel, assertNoPaidHabitChannel,
  shouldHoldForQuietHours, collapseWindowMinutes, EVENT_POLICY,
  type UserCapabilities, type Channel,
} from './event-policy';

const NOTHING: UserCapabilities = { push: false, whatsapp: false, email: false, calendar: false };
const EVERYTHING: UserCapabilities = { push: true, whatsapp: true, email: true, calendar: true };

describe('channel choice is per-user capability, not a global rule', () => {
  it('a fully-equipped student gets the best rail for the event', () => {
    expect(chooseChannels('session_cancelled', EVERYTHING)[0]).toBe('whatsapp');
    expect(chooseChannels('weekly_digest', EVERYTHING)[0]).toBe('email');
    expect(chooseChannels('session_reminder', EVERYTHING)[0]).toBe('calendar');
  });

  it('a student with only push falls through to push — the same event, a different rail', () => {
    const pushOnly = { ...NOTHING, push: true };
    expect(chooseChannels('session_cancelled', pushOnly)).toEqual(['push', 'in_app']);
    expect(chooseChannels('weekly_digest', pushOnly)).toEqual(['push', 'in_app']);
  });

  it('a student with NOTHING still gets the in-app row — never zero record', () => {
    // 82% of our students have no push subscription. If "no capability" meant
    // "no notification", the majority of the product would be silent.
    expect(chooseChannels('session_cancelled', NOTHING)).toEqual(['in_app']);
    expect(chooseChannels('chat', NOTHING)).toEqual(['in_app']);
  });

  it('capability the event does not want is not used', () => {
    // A student with WhatsApp does not get a daily nudge on WhatsApp just
    // because the number exists — the event decides, then the capability.
    expect(chooseChannels('daily_heartbeat', EVERYTHING)).toEqual(['push', 'in_app']);
  });

  it('an unknown event falls back to the safest reaching rail, never a paid one', () => {
    const chosen = chooseChannels('some_future_event', EVERYTHING);
    expect(chosen).toEqual(['push', 'in_app']);
    expect(chosen.some(isPaidChannel)).toBe(false);
  });
});

describe('EVENT-OS invariant 2 — habit traffic never rides a paid rail', () => {
  it('every habit event in the catalogue is free-rail only', () => {
    for (const [type, policy] of Object.entries(EVENT_POLICY)) {
      if (policy.taxonomy !== 'habit') continue;
      const paid = policy.ladder.filter(isPaidChannel);
      expect(paid, `${type} is habit traffic but lists paid rail(s): ${paid.join(', ')}`).toEqual([]);
    }
  });

  it('no capability combination can put habit traffic on WhatsApp', () => {
    // The economic reason, stated once: a daily nudge to 3,000 active
    // students is ~₹0 on push and ~₹98,000/month if Meta classifies it as
    // marketing. This test is the thing standing between those two numbers.
    for (const [type, policy] of Object.entries(EVENT_POLICY)) {
      if (policy.taxonomy !== 'habit') continue;
      expect(chooseChannels(type, EVERYTHING)).not.toContain('whatsapp');
    }
  });

  it('the assertion refuses a habit policy that lists a paid rail', () => {
    expect(() => assertNoPaidHabitChannel('habit', ['whatsapp', 'push'] as Channel[]))
      .toThrow(/invariant 2/);
    expect(() => assertNoPaidHabitChannel('transactional', ['whatsapp'] as Channel[]))
      .not.toThrow();
  });
});

describe('quiet hours are derived, not assumed', () => {
  const NIGHT = { startMinute: 23 * 60, endMinute: 7 * 60 }; // crosses midnight
  const at = (h: number, m = 0) => h * 60 + m;

  it('a non-urgent event at 1am waits', () => {
    expect(shouldHoldForQuietHours('student_logged', at(1), NIGHT)).toBe(true);
  });

  it('a cancellation at 1am does NOT wait — silence is the harm', () => {
    expect(shouldHoldForQuietHours('session_cancelled', at(1), NIGHT)).toBe(false);
  });

  it('a reply to a student who wrote minutes ago does not wait', () => {
    // CAT aspirants study late. A buddy answering at 23:30 someone who wrote
    // at 23:10 is answering a person sitting there waiting — holding that
    // until morning is the wrong kind of politeness.
    expect(shouldHoldForQuietHours('chat', at(23, 30), NIGHT, { minutesSinceRecipientActed: 20 })).toBe(true);
    expect(shouldHoldForQuietHours('chat', at(23, 30), NIGHT, { minutesSinceRecipientActed: 5 })).toBe(false);
  });

  it('no configured window means nothing ever waits', () => {
    expect(shouldHoldForQuietHours('student_logged', at(3), null)).toBe(false);
  });

  it('daytime never waits', () => {
    expect(shouldHoldForQuietHours('student_logged', at(14), NIGHT)).toBe(false);
  });
});

describe('collapse windows', () => {
  it('chat collapses — four replies in four minutes are one interruption', () => {
    expect(collapseWindowMinutes('chat')).toBe(10);
  });
  it('a session cancellation never collapses — each one is its own fact', () => {
    expect(collapseWindowMinutes('session_cancelled')).toBeNull();
  });
});

describe('the catalogue agrees with the constitution', () => {
  it('every P0 event reaches for a rail that actually interrupts', () => {
    for (const [type, p] of Object.entries(EVENT_POLICY)) {
      if (p.importance !== 'P0') continue;
      expect(p.ladder.length, `${type} is P0 but has no delivery rail`).toBeGreaterThan(0);
    }
  });

  it('commercial events are push-only here — the pitch authority owns the rest', () => {
    // Channel policy must not become a second place that decides whether a
    // commercial message may go out. promo_impressions is that authority.
    for (const [type, p] of Object.entries(EVENT_POLICY)) {
      if (p.taxonomy !== 'commercial') continue;
      expect(p.ladder.some(isPaidChannel), `${type} would spend money outside the pitch authority`).toBe(false);
    }
  });

  it('policyFor is total — every catalogue key resolves', () => {
    for (const type of Object.keys(EVENT_POLICY)) {
      expect(policyFor(type)).toBe(EVENT_POLICY[type]);
    }
  });
});
