import { describe, it, expect } from 'vitest';
import {
  isBookingBlocked, blockedCreditException, blockedCreditExceptions,
  creditBlockPatch, shouldAlert, daysBlocked, BLOCKED_CREDIT_CODE,
  type BlockedCreditInput,
} from './booking-blocked';
import { aggregate } from './os/exception';

const NOW = Date.parse('2026-08-27T12:00:00.000Z');
const daysAgo = (d: number) => NOW - d * 86_400_000;

/** The live case this was built for: Dhruv, paid 24 Aug, mentor has no calendar. */
const dhruv = (o: Partial<BlockedCreditInput> = {}): BlockedCreditInput => ({
  creditId: '36730468', studentId: 'b8da2a36', studentLabel: 'Dhruv Vakadia',
  buddyId: 'fae09cca', buddyLabel: 'Shreya Bendigeri',
  status: 'assigned', amountPaise: 29900,
  assignedAtMs: daysAgo(2), videoSessionId: null, reason: 'no_availability', ...o,
});

describe('isBookingBlocked — deterministic, and decides every state', () => {
  it('a paid credit whose mentor has no calendar is blocked', () => {
    expect(isBookingBlocked(dhruv())).toBe(true);
  });

  it('a credit already pointing at a session is NOT blocked', () => {
    expect(isBookingBlocked(dhruv({ videoSessionId: 'sess-1' }))).toBe(false);
  });

  it('a bookable mentor means not blocked', () => {
    expect(isBookingBlocked(dhruv({ reason: null }))).toBe(false);
  });

  it('no mentor assigned yet is a DIFFERENT problem, not this one', () => {
    expect(isBookingBlocked(dhruv({ buddyId: null }))).toBe(false);
  });

  it.each(['paid', 'assigned', 'booking_blocked'])('%s owes a session', (status) => {
    expect(isBookingBlocked(dhruv({ status }))).toBe(true);
  });

  it.each(['scheduled', 'completed', 'refunded', 'assignment_failed'])(
    '%s does not', (status) => {
      expect(isBookingBlocked(dhruv({ status }))).toBe(false);
    },
  );

  it.each(['no_availability', 'not_taking_bookings', 'no_meeting_room'] as const)(
    'every unbookable reason blocks: %s', (reason) => {
      expect(isBookingBlocked(dhruv({ reason }))).toBe(true);
    },
  );
});

describe('blockedCreditException — evidence is never invented', () => {
  it('returns null when nothing is wrong', () => {
    expect(blockedCreditException(dhruv({ reason: null }), NOW)).toBeNull();
  });

  it('carries the money, the wait and the mentor', () => {
    const e = blockedCreditException(dhruv(), NOW)!;
    expect(e.code).toBe(BLOCKED_CREDIT_CODE);
    expect(e.domain).toBe('revenue');
    expect(e.evidence.amountRupees).toBe(299);
    expect(e.evidence.daysBlocked).toBe(2);
    expect(e.evidence.buddy).toBe('Shreya Bendigeri');
    expect(e.evidence.unbookableReason).toBe('no_availability');
  });

  it('records the promise the student was actually shown', () => {
    const e = blockedCreditException(dhruv(), NOW)!;
    expect(String(e.evidence.promiseShownToStudent)).toContain('Our team will set your session time');
  });

  it('drills down to the exact student — the contract forbids charts', () => {
    expect(blockedCreditException(dhruv(), NOW)!.destination).toContain('b8da2a36');
  });

  it.each([
    ['named mentor', 'Shreya Bendigeri'],
    ['unnamed mentor', null],
  ])('does NOT suggest reassigning the student (%s)', (_label, buddyLabel) => {
    // Reassignment overrides a human decision and cuts a live conversation.
    // It is a judgement call, never a suggested default.
    //
    // BOTH branches, because mutation testing caught the first version of this
    // test exercising only the named-mentor path — the fallback could have said
    // "Reassign the student" and the suite would have stayed green.
    const e = blockedCreditException(dhruv({ buddyLabel }), NOW)!;
    expect(e.suggestedAction.label.toLowerCase()).not.toContain('reassign');
    expect(e.suggestedAction.route).not.toContain('reassign');
    expect(e.suggestedAction.label.toLowerCase()).toContain('availability');
  });

  it('never claims a self-heal it did not attempt', () => {
    const e = blockedCreditException(dhruv(), NOW)!;
    expect(e.recovery).toEqual({ attempted: false, status: 'none' });
  });

  it('handles a missing amount without inventing one', () => {
    const e = blockedCreditException(dhruv({ amountPaise: null }), NOW)!;
    expect(e.evidence.amountRupees).toBeNull();
    expect(e.reason).not.toContain('₹');
  });

  it('handles a never-assigned timestamp without inventing a wait', () => {
    const e = blockedCreditException(dhruv({ assignedAtMs: null }), NOW)!;
    expect(e.evidence.daysBlocked).toBeNull();
  });
});

describe('severity climbs with the wait, so "critical" keeps meaning something', () => {
  it('a fresh block is high, not critical', () => {
    expect(blockedCreditException(dhruv({ assignedAtMs: NOW - 60_000 }), NOW)!.severity).toBe('high');
  });

  it('past a day it is critical — money taken, student stuck', () => {
    expect(blockedCreditException(dhruv({ assignedAtMs: daysAgo(2) }), NOW)!.severity).toBe('critical');
  });

  it('the real case — 2 days — is critical', () => {
    expect(blockedCreditException(dhruv(), NOW)!.severity).toBe('critical');
  });
});

describe('the producer rolls up through the existing Exception primitive', () => {
  it('filters to only the blocked ones', () => {
    const out = blockedCreditExceptions([
      dhruv({ creditId: 'a' }),
      dhruv({ creditId: 'b', reason: null }),
      dhruv({ creditId: 'c', videoSessionId: 'sess-1' }),
      dhruv({ creditId: 'd', status: 'completed' }),
    ], NOW);
    expect(out.map((e) => e.evidence.creditId)).toEqual(['a']);
  });

  it('N blocked credits aggregate into ONE incident without losing anybody', () => {
    const out = blockedCreditExceptions(
      ['a', 'b', 'c'].map((id) => dhruv({ creditId: id, studentId: `stu-${id}` })), NOW,
    );
    const [incident] = aggregate(out);
    expect(incident.code).toBe(BLOCKED_CREDIT_CODE);
    expect(incident.affected).toBe(3);
    expect(incident.members).toHaveLength(3);
    expect(incident.evidenceRollup.amountRupees).toBe(897); // 3 x ₹299
  });

  it('an empty set produces nothing rather than a zero-row incident', () => {
    expect(blockedCreditExceptions([], NOW)).toEqual([]);
    expect(aggregate([])).toEqual([]);
  });
});

describe('creditBlockPatch — idempotent, and never erases how long it has been stuck', () => {
  const NOW_ISO = '2026-08-27T12:00:00.000Z';
  const EARLIER = '2026-08-25T17:47:00.000Z';

  it('stamps a first detection', () => {
    const p = creditBlockPatch(
      { status: 'assigned', failure_reason: null, failure_at: null }, 'no_availability', NOW_ISO,
    );
    expect(p).toMatchObject({
      status: 'booking_blocked', owner: 'ops',
      failure_reason: 'no_availability', failure_at: NOW_ISO,
    });
    // A sentence ops can act on, matching the release path's convention.
    expect(p!.next_action).toContain('availability');
  });

  it('writes nothing when the same block is already recorded', () => {
    expect(creditBlockPatch(
      { status: 'booking_blocked', failure_reason: 'no_availability', failure_at: EARLIER },
      'no_availability', NOW_ISO,
    )).toBeNull();
  });

  it('PRESERVES failure_at when re-detecting the same reason from another status', () => {
    // The age is what decides severity. A sweep that refreshed this every run
    // would report a week-old problem as new, forever.
    const p = creditBlockPatch(
      { status: 'assigned', failure_reason: 'no_availability', failure_at: EARLIER },
      'no_availability', NOW_ISO,
    );
    expect(p!.failure_at).toBe(EARLIER);
  });

  it('re-stamps when the reason CHANGES — that is a new problem', () => {
    const p = creditBlockPatch(
      { status: 'booking_blocked', failure_reason: 'no_availability', failure_at: EARLIER },
      'no_meeting_room', NOW_ISO,
    );
    expect(p!.failure_reason).toBe('no_meeting_room');
    expect(p!.failure_at).toBe(NOW_ISO);
  });

  it('never writes a status other than booking_blocked', () => {
    const p = creditBlockPatch(
      { status: 'paid', failure_reason: null, failure_at: null }, 'not_taking_bookings', NOW_ISO,
    )!;
    expect(p.status).toBe('booking_blocked');
    expect(p.owner).toBe('ops');
  });
});

describe('shouldAlert — once a day, so the channel stays readable', () => {
  it('alerts when nothing has been sent for this credit today', () => {
    expect(shouldAlert(null, '2026-08-27')).toBe(true);
    expect(shouldAlert('2026-08-26', '2026-08-27')).toBe(true);
  });

  it('does not alert twice in one day', () => {
    expect(shouldAlert('2026-08-27', '2026-08-27')).toBe(false);
  });
});

describe('daysBlocked', () => {
  it('floors to whole days and never goes negative', () => {
    expect(daysBlocked(daysAgo(2), NOW)).toBe(2);
    expect(daysBlocked(NOW + 60_000, NOW)).toBe(0);
    expect(daysBlocked(null, NOW)).toBeNull();
  });
});
