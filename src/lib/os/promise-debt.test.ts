import { describe, it, expect } from 'vitest';
import {
  readPromiseDebt, promiseDebtReason, promiseDebtException, findPromiseDebt,
  PROMISE_DEBT_MIN_OVERDUE, PROMISE_STUCK_DAYS,
} from './promise-debt';

const NOW = Date.parse('2026-09-15T13:00:00Z');
const daysAgo = (n: number) => new Date(NOW - n * 86_400_000).toISOString();
const daysAhead = (n: number) => new Date(NOW + n * 86_400_000).toISOString();

const read = (rows: string[]) => readPromiseDebt({
  repId: 'n1', repName: 'Neelam', rows: rows.map((callbackAt) => ({ callbackAt })), nowMs: NOW,
});

describe('what production looked like on 15 Sep', () => {
  // Neelam: 30 callbacks set, 24 overdue, 15 past three days, 10 past a week,
  // oldest 7 Sep. Anshul: 13 set, 1 overdue, none stale.
  const neelam = read([
    ...Array.from({ length: 10 }, () => daysAgo(8)),
    ...Array.from({ length: 5 }, () => daysAgo(4)),
    ...Array.from({ length: 9 }, () => daysAgo(1)),
    ...Array.from({ length: 6 }, () => daysAhead(1)),
  ]);
  const anshul = read([daysAgo(0.2), ...Array.from({ length: 12 }, () => daysAhead(1))]);

  it('counts the debt that blocks the day', () => {
    expect(neelam.overdue).toBe(24);
    expect(neelam.stuck).toBe(15);
    expect(neelam.oldestDays).toBe(8);
    expect(neelam.isInDebt).toBe(true);
  });

  it('leaves alone the counsellor who keeps their promises', () => {
    expect(anshul.overdue).toBe(1);
    expect(anshul.isInDebt).toBe(false);
  });

  it('does not count a promise that is not due yet', () => {
    // Six of Neelam's thirty are future. A promise for tomorrow is a kept
    // promise in progress, not a debt.
    expect(read(Array.from({ length: 30 }, () => daysAhead(2))).overdue).toBe(0);
  });

  it('ignores an unparseable time rather than guessing at it', () => {
    expect(read(['not-a-date', daysAgo(5)]).overdue).toBe(1);
  });

  it('reports no oldest when there is no debt', () => {
    expect(read([daysAhead(1)]).oldestDays).toBeNull();
  });
});

describe('the thresholds refuse to fire on an ordinary busy week', () => {
  it('needs enough overdue promises to actually block a day', () => {
    const r = read(Array.from({ length: PROMISE_DEBT_MIN_OVERDUE - 1 }, () => daysAgo(10)));
    expect(r.isInDebt).toBe(false);
  });

  it('does not fire when everything slipped only this morning', () => {
    // Twenty promises, all a few hours late. That is a busy day, and the
    // counsellor will catch them — not a blockage that never resolves.
    const r = read(Array.from({ length: 20 }, () => daysAgo(0.5)));
    expect(r.overdue).toBe(20);
    expect(r.stuck).toBe(0);
    expect(r.isInDebt).toBe(false);
  });

  it('fires once the pile is big enough and some of it has gone stale', () => {
    const r = read([
      ...Array.from({ length: PROMISE_DEBT_MIN_OVERDUE - 1 }, () => daysAgo(0.5)),
      daysAgo(PROMISE_STUCK_DAYS),
    ]);
    expect(r.isInDebt).toBe(true);
  });
});

describe('what the founder reads', () => {
  const r = read([
    ...Array.from({ length: 10 }, () => daysAgo(8)),
    ...Array.from({ length: 14 }, () => daysAgo(4)),
  ]);

  it('explains the arithmetic and names no fault', () => {
    const s = promiseDebtReason(r);
    expect(s).toContain('24 promised callbacks');
    expect(s).toContain('committed before it starts');
    for (const forbidden of ['lazy', 'failing', 'ignoring', 'neglect', 'blame', 'dishonest']) {
      expect(s.toLowerCase()).not.toContain(forbidden);
    }
  });

  // ── THE POINT THE FOUNDER ASKED ABOUT ─────────────────────────────────────
  //
  // He asked to split the book. The debt travels with the promises, not the
  // book, so the sentence has to say so where he reads it — otherwise he moves
  // 333 students and the day is unchanged.
  it('says plainly that moving the book would not change it', () => {
    expect(promiseDebtReason(r)).toContain('moving the book would not change it');
  });

  // SALES-OS: a callback is a time a STUDENT asked us to ring back. Clearing
  // the debt means ringing them, never deleting what they are owed.
  it('asks for the promises to be KEPT, never cancelled', () => {
    const e = promiseDebtException(r, NOW);
    expect(e.suggestedAction.label).toContain('Clear');
    expect(e.suggestedAction.label).toContain('still waiting');
    for (const bad of ['cancel', 'delete', 'drop', 'bump', 'expire']) {
      expect(e.suggestedAction.label.toLowerCase()).not.toContain(bad);
    }
  });

  it('drills into the rep whose promises they are', () => {
    const e = promiseDebtException(r, NOW);
    expect(e.code).toBe('promises_overdue_blocking_day');
    expect(e.severity).toBe('high');
    expect(e.entity).toEqual({ kind: 'sales_rep', id: 'n1', label: 'Neelam' });
    expect(e.destination).toContain('/admin/sales-performance');
    expect(e.destination).toContain('rep=n1');
    expect(e.evidence.overdue_promises).toBe(24);
  });

  it('keys the id to one exception per rep per day', () => {
    expect(promiseDebtException(r, NOW).id).toBe('promise-debt:n1:2026-09-15');
  });
});

// ── THE QUERY SIDE ──────────────────────────────────────────────────────────

/* eslint-disable @typescript-eslint/no-explicit-any */
function admin(tables: Record<string, any>) {
  const chain = (table: string): any => {
    const c: any = {};
    for (const m of ['select', 'eq', 'in', 'gte', 'lt', 'not', 'order', 'limit', 'range']) c[m] = () => c;
    c.then = (ok: any) => {
      const v = tables[table];
      if (v instanceof Error) return Promise.resolve({ data: null, error: { message: v.message } }).then(ok);
      return Promise.resolve({ data: v ?? [], error: null }).then(ok);
    };
    return c;
  };
  return { from: chain };
}

describe('reading it off the database', () => {
  const seats = [{ rep_id: 'n1' }, { rep_id: 'a1' }];
  const people = [{ id: 'n1', full_name: 'Neelam' }, { id: 'a1', full_name: 'Anshul' }];
  const outreach = [
    ...Array.from({ length: 24 }, (_, i) => ({
      student_id: `s${i}`, owner_id: 'n1', callback_at: daysAgo(i < 15 ? 5 : 1),
    })),
    { student_id: 'x1', owner_id: 'a1', callback_at: daysAgo(0.1) },
    { student_id: 'x2', owner_id: 'a1', callback_at: daysAhead(1) },
  ];

  it('flags only the book carrying the debt', async () => {
    const out = await findPromiseDebt(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: outreach }), NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].entity.label).toBe('Neelam');
    expect(out[0].evidence.overdue_promises).toBe(24);
    expect(out[0].evidence.stuck_past_days).toBe(15);
  });

  it('says nothing when every promise is still in the future', async () => {
    const future = outreach.map((r) => ({ ...r, callback_at: daysAhead(2) }));
    expect(await findPromiseDebt(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: future }), NOW,
    )).toEqual([]);
  });

  // An exception invented out of a bad database moment sends a founder into a
  // conversation about a problem that is not there.
  it('stays silent when the roster cannot be read', async () => {
    expect(await findPromiseDebt(admin({ sales_rep_config: new Error('down') }), NOW)).toEqual([]);
  });

  it('stays silent when the book cannot be read', async () => {
    expect(await findPromiseDebt(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: new Error('timeout') }), NOW,
    )).toEqual([]);
  });
});
