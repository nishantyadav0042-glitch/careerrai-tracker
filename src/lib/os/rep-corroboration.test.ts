import { describe, it, expect } from 'vitest';
import {
  readCorroboration, corroborationReason, corroborationException, findUncorroboratedReps,
  CORROBORATION_MIN_CONVERSATIONS, CORROBORATION_WINDOW_DAYS,
} from './rep-corroboration';

const read = (conversations: number, corroborated: number) =>
  readCorroboration({ repId: 'r1', repName: 'Neelam', conversations, corroborated });

describe('the signal a counsellor cannot write', () => {
  it('fires only at zero on a full sample', () => {
    expect(read(CORROBORATION_MIN_CONVERSATIONS, 0).isUncorroborated).toBe(true);
    // One student who came back is enough to say the conversations are real.
    expect(read(CORROBORATION_MIN_CONVERSATIONS, 1).isUncorroborated).toBe(false);
  });

  it('never fires on a sample too small to mean anything', () => {
    const r = read(CORROBORATION_MIN_CONVERSATIONS - 1, 0);
    expect(r.isUncorroborated).toBe(false);
    // And reports an honest unknown rather than a flattering 0%.
    expect(r.ratio).toBeNull();
  });

  // ── NO GRADIENT, ON PURPOSE ───────────────────────────────────────────────
  //
  // SALES-OS §0 forbids this becoming a rate with a target on it. A counsellor
  // judged on whether students return would start recording only the students
  // who were returning anyway, and the book's honesty would be gone in a
  // fortnight. So there is exactly one trigger and no score to chase.
  it('has no partial verdict between zero and one', () => {
    for (const n of [1, 2, 5, 15, 29]) {
      expect(read(60, n).isUncorroborated, `${n} of 60 must not fire`).toBe(false);
    }
  });

  it('reports the rate for context once the sample is real', () => {
    expect(read(60, 15).ratio).toBeCloseTo(0.25);
  });
});

describe('what the founder reads', () => {
  it('states both readings and picks neither', () => {
    const s = corroborationReason(read(70, 0));
    expect(s).toContain('70 conversations');
    expect(s).toContain('Either those conversations are not happening');
    expect(s).toContain('nothing in them is landing');
    expect(s).toContain('cannot tell which');
    for (const forbidden of ['lying', 'fraud', 'fake', 'dishonest']) {
      expect(s.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('is severity normal — monitor, never page', () => {
    const e = corroborationException(read(70, 0), Date.parse('2026-09-15T13:00:00Z'));
    expect(e.severity).toBe('normal');
    expect(e.code).toBe('rep_conversations_uncorroborated');
    expect(e.entity.kind).toBe('sales_rep');
    expect(e.destination).toContain('rep=r1');
    expect(e.evidence.evidence_class).toBe('student_side_observed');
  });

  it('suggests the cheapest verification there is', () => {
    const e = corroborationException(read(70, 0), Date.now());
    expect(e.suggestedAction.label).toContain('Call 3');
  });
});

// ── THE QUERY SIDE ──────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function admin(tables: Record<string, any>) {
  const chain = (table: string): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'not', 'order', 'limit']) c[m] = () => c;
    c.then = (ok: any) => {
      const v = tables[table];
      if (v instanceof Error) return Promise.resolve({ data: null, error: { message: v.message } }).then(ok);
      return Promise.resolve({ data: v ?? [], error: null }).then(ok);
    };
    return c;
  };
  return { from: chain };
}

const NOW = Date.parse('2026-09-15T13:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();

describe('reading it off the database', () => {
  const seats = [{ rep_id: 'r1' }];
  const people = [{ id: 'r1', full_name: 'Neelam' }];

  it('flags a rep whose 30 conversations moved nobody', () => {
    const convos = Array.from({ length: 30 }, (_, i) => ({
      actor_id: 'r1', student_id: `s${i}`, created_at: daysAgo(7),
    }));
    return findUncorroboratedReps(
      admin({ sales_rep_config: seats, profiles: people, sales_activity: convos, student_events: [] }), NOW,
    ).then((out) => {
      expect(out).toHaveLength(1);
      expect(out[0].evidence.conversations).toBe(30);
      expect(out[0].evidence.students_who_returned).toBe(0);
    });
  });

  it('clears the rep the moment one student comes back inside the window', async () => {
    const convos = Array.from({ length: 40 }, (_, i) => ({
      actor_id: 'r1', student_id: `s${i}`, created_at: daysAgo(7),
    }));
    const events = [{ user_id: 's3', created_at: daysAgo(6) }];   // 1 day after
    const out = await findUncorroboratedReps(
      admin({ sales_rep_config: seats, profiles: people, sales_activity: convos, student_events: events }), NOW,
    );
    expect(out).toHaveLength(0);
  });

  it('does not count activity that came BEFORE the conversation', async () => {
    const convos = Array.from({ length: 30 }, (_, i) => ({
      actor_id: 'r1', student_id: `s${i}`, created_at: daysAgo(7),
    }));
    // The student was active a day before the call. That corroborates nothing.
    const events = [{ user_id: 's3', created_at: daysAgo(8) }];
    const out = await findUncorroboratedReps(
      admin({ sales_rep_config: seats, profiles: people, sales_activity: convos, student_events: events }), NOW,
    );
    expect(out).toHaveLength(1);
  });

  it('does not count activity long after the window closed', async () => {
    const convos = Array.from({ length: 30 }, (_, i) => ({
      actor_id: 'r1', student_id: `s${i}`, created_at: daysAgo(10),
    }));
    const events = [{ user_id: 's3', created_at: daysAgo(10 - CORROBORATION_WINDOW_DAYS - 2) }];
    const out = await findUncorroboratedReps(
      admin({ sales_rep_config: seats, profiles: people, sales_activity: convos, student_events: events }), NOW,
    );
    expect(out).toHaveLength(1);
  });

  // ── THE DIRECTION OF FAILURE ──────────────────────────────────────────────
  //
  // This check exists to question a record. It must never manufacture a doubt
  // out of our own database having a bad moment.
  it('stays silent when the roster cannot be read', async () => {
    expect(await findUncorroboratedReps(admin({ sales_rep_config: new Error('down') }), NOW)).toEqual([]);
  });

  it('stays silent when the conversation read fails', async () => {
    expect(await findUncorroboratedReps(
      admin({ sales_rep_config: seats, profiles: people, sales_activity: new Error('timeout') }), NOW,
    )).toEqual([]);
  });

  it('stays silent when the student-side read fails', async () => {
    const convos = Array.from({ length: 30 }, (_, i) => ({
      actor_id: 'r1', student_id: `s${i}`, created_at: daysAgo(7),
    }));
    expect(await findUncorroboratedReps(
      admin({ sales_rep_config: seats, profiles: people, sales_activity: convos, student_events: new Error('down') }), NOW,
    )).toEqual([]);
  });

  it('stays silent when there are no conversations at all', async () => {
    expect(await findUncorroboratedReps(
      admin({ sales_rep_config: seats, profiles: people, sales_activity: [], student_events: [] }), NOW,
    )).toEqual([]);
  });
});
