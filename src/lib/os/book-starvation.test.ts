import { describe, it, expect } from 'vitest';
import {
  zeroFreshStreak, readStarvation, starvationReason, starvationException, findStarvedBooks,
  STARVED_MIN_UNREACHED, STARVED_MIN_ZERO_DAYS, type RepDay,
} from './book-starvation';

const day = (d: string, dealt: number, fresh: number): RepDay => ({ day: d, dealt, fresh });

describe('counting back from the last day actually worked', () => {
  // ── THE LEAVE THAT MUST NOT LOOK LIKE STARVATION ──────────────────────────
  //
  // Neelam was on approved leave 12-14 Sep. If the streak counted calendar
  // days, her holiday would have become three days of evidence against the
  // deck, and the founder would have read a number that was wrong about a real
  // person. Days with no cards dealt are not working days.
  it('skips days the counsellor was dealt nothing', () => {
    const days = [
      day('2026-09-15', 73, 0), day('2026-09-14', 0, 0), day('2026-09-13', 0, 0),
      day('2026-09-12', 0, 0), day('2026-09-11', 69, 0), day('2026-09-10', 69, 0),
    ];
    expect(zeroFreshStreak(days)).toBe(3);
  });

  it('stops at the first day the lane moved', () => {
    const days = [
      day('2026-09-15', 70, 0), day('2026-09-14', 71, 0),
      day('2026-09-13', 70, 43), day('2026-09-12', 70, 0),
    ];
    expect(zeroFreshStreak(days)).toBe(2);
  });

  it('is zero when the most recent working day dealt new students', () => {
    expect(zeroFreshStreak([day('2026-09-15', 70, 47), day('2026-09-14', 71, 0)])).toBe(0);
  });

  it('reads an unordered list the same way', () => {
    const days = [day('2026-09-13', 70, 0), day('2026-09-15', 73, 0), day('2026-09-14', 71, 0)];
    expect(zeroFreshStreak(days)).toBe(3);
  });

  it('has no streak to report when nothing was ever dealt', () => {
    expect(zeroFreshStreak([])).toBe(0);
    expect(zeroFreshStreak([day('2026-09-15', 0, 0)])).toBe(0);
  });
});

describe('what production looked like on 15 Sep', () => {
  // Neelam: 583 in the book, 333 never dealt, and zero fresh cards on every
  // working day from 6 Sep to 11 Sep.
  const neelam = readStarvation({
    repId: 'n1', repName: 'Neelam', bookSize: 583, neverDealt: 333,
    days: [
      day('2026-09-11', 69, 0), day('2026-09-10', 69, 0), day('2026-09-09', 114, 0),
      day('2026-09-08', 104, 0), day('2026-09-07', 105, 0), day('2026-09-06', 77, 0),
    ],
  });

  // Anshul: the same size of pile, moving every day. This must NEVER fire —
  // working through a big book is the job, not a fault.
  const anshul = readStarvation({
    repId: 'a1', repName: 'Anshul', bookSize: 555, neverDealt: 277,
    days: [
      day('2026-09-15', 70, 47), day('2026-09-14', 71, 49), day('2026-09-13', 70, 43),
      day('2026-09-12', 70, 15), day('2026-09-11', 66, 17),
    ],
  });

  it('catches the book that is not moving', () => {
    expect(neelam.isStarved).toBe(true);
    expect(neelam.zeroFreshDays).toBe(6);
  });

  it('leaves alone the book that is', () => {
    expect(anshul.isStarved).toBe(false);
    expect(anshul.zeroFreshDays).toBe(0);
  });
});

describe('the thresholds refuse to fire on thin evidence', () => {
  const days = Array.from({ length: 6 }, (_, i) => day(`2026-09-0${i + 1}`, 60, 0));

  it('needs a pile worth reporting', () => {
    const r = readStarvation({
      repId: 'r', repName: 'R', bookSize: 60, neverDealt: STARVED_MIN_UNREACHED - 1, days,
    });
    expect(r.isStarved).toBe(false);
  });

  it('needs the drought to be structural, not a heavy week', () => {
    const r = readStarvation({
      repId: 'r', repName: 'R', bookSize: 600, neverDealt: 300,
      days: days.slice(0, STARVED_MIN_ZERO_DAYS - 1),
    });
    expect(r.isStarved).toBe(false);
  });

  it('fires the moment both are true', () => {
    const r = readStarvation({
      repId: 'r', repName: 'R', bookSize: 600, neverDealt: STARVED_MIN_UNREACHED,
      days: days.slice(0, STARVED_MIN_ZERO_DAYS),
    });
    expect(r.isStarved).toBe(true);
  });
});

describe('what the founder actually reads', () => {
  const r = readStarvation({
    repId: 'n1', repName: 'Neelam', bookSize: 583, neverDealt: 333,
    days: [day('2026-09-11', 69, 0), day('2026-09-10', 69, 0), day('2026-09-09', 114, 0)],
  });

  // ── SALES-OS §0 ───────────────────────────────────────────────────────────
  //
  // Booking callbacks is the job. A counsellor who does it well is the one who
  // produces this exception, so the sentence has to name the arithmetic and
  // nobody's character — the founder reads this straight into a conversation
  // with the person it names.
  it('blames the arithmetic, never the counsellor', () => {
    const s = starvationReason(r);
    expect(s).toContain('333 of the 583');
    expect(s).toContain('not anyone');
    for (const forbidden of ['lazy', 'slow', 'failing', 'underperform', 'fault of', 'blame']) {
      expect(s.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('does not tell the founder to jam more cards into a full day', () => {
    // Her day already carried 30 promised callbacks she had not kept. "Deal
    // more" would trade a kept promise for a cold call.
    const e = starvationException(r, Date.parse('2026-09-15T13:00:00Z'));
    expect(e.suggestedAction.label.toLowerCase()).not.toMatch(/deal more|add more|increase/);
    expect(e.suggestedAction.label).toContain('Decide');
  });

  it('drills down to the rep whose book it is', () => {
    const e = starvationException(r, Date.now());
    expect(e.code).toBe('book_never_reached');
    expect(e.severity).toBe('high');
    expect(e.entity).toEqual({ kind: 'sales_rep', id: 'n1', label: 'Neelam' });
    // Founder rule 6: an exception you cannot drill into is a chart.
    expect(e.destination).toContain('/admin/sales-performance');
    expect(e.destination).toContain('rep=n1');
    expect(e.evidence.never_dealt_a_card).toBe(333);
  });

  it('keys the id so one drought is one exception per day', () => {
    const at = Date.parse('2026-09-15T13:00:00Z');
    expect(starvationException(r, at).id).toBe(starvationException(r, at).id);
    expect(starvationException(r, at).id).toBe('book-starvation:n1:2026-09-15');
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

const NOW = Date.parse('2026-09-15T13:00:00Z');

describe('reading it off the database', () => {
  const seats = [{ rep_id: 'n1' }];
  const people = [{ id: 'n1', full_name: 'Neelam' }];
  const book = Array.from({ length: 200 }, (_, i) => ({ student_id: `s${i}`, owner_id: 'n1' }));
  // Only s0-s49 have ever been dealt, all on promise lanes, across four days.
  const cards = Array.from({ length: 50 }, (_, i) => ({
    student_id: `s${i}`, rep_id: 'n1', lane: 'callback',
    ist_day: `2026-09-1${1 + (i % 4)}`,
  }));

  it('flags a book where 150 students have never been dealt a card', async () => {
    const out = await findStarvedBooks(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: book, sales_opportunity: cards }), NOW,
    );
    expect(out).toHaveLength(1);
    expect(out[0].evidence.never_dealt_a_card).toBe(150);
    expect(out[0].evidence.book_size).toBe(200);
  });

  it('clears the book as soon as the fresh lane moves again', async () => {
    const moving = [...cards, { student_id: 's150', rep_id: 'n1', lane: 'fresh', ist_day: '2026-09-14' }];
    const out = await findStarvedBooks(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: book, sales_opportunity: moving }), NOW,
    );
    expect(out).toEqual([]);
  });

  // ── THE DIRECTION OF FAILURE ──────────────────────────────────────────────
  //
  // An exception invented out of a bad database moment sends a founder into a
  // conversation about a problem that is not there.
  it('stays silent when the roster cannot be read', async () => {
    expect(await findStarvedBooks(admin({ sales_rep_config: new Error('down') }), NOW)).toEqual([]);
  });

  it('stays silent when the book cannot be read', async () => {
    expect(await findStarvedBooks(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: new Error('timeout') }), NOW,
    )).toEqual([]);
  });

  it('stays silent when the card history cannot be read', async () => {
    expect(await findStarvedBooks(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: book, sales_opportunity: new Error('down') }), NOW,
    )).toEqual([]);
  });

  it('says nothing about a seat with no book', async () => {
    expect(await findStarvedBooks(
      admin({ sales_rep_config: seats, profiles: people, lead_outreach: [], sales_opportunity: [] }), NOW,
    )).toEqual([]);
  });
});
