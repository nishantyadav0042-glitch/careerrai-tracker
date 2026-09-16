/**
 * ── Cover is access for a day, never a transfer of ownership ───────────────
 *
 * Neelam's 583 students got nothing for three days in September because an
 * owned lead is invisible to every other seat. Cover fixes that — and every
 * obvious way of fixing it is worse than the bug:
 *
 *   · moving ownership cuts a counsellor's book while she is ill, and she
 *     comes back to a smaller one. The founder was explicit: "ownership nahi
 *     badalti — sirf us din ka access."
 *   · granting the book to EVERY present seat undoes "zero mixup between
 *     reps" on exactly the days nobody is watching.
 *   · widening `canAccessLead` unconditionally would hand every rep every
 *     book, every day.
 *
 * This guard holds all three shut.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { canAccessLead } from './sales-authz';

const read = (f: string) => readFileSync(join(__dirname, f), 'utf8');
const code = (f: string) =>
  read(f).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const A = 'a1111111-1111-4111-8111-111111111111';
const N = 'b2222222-2222-4222-8222-222222222222';

describe('the widening is exactly one path and no wider', () => {
  it('a non-owner with no cover is still refused', () => {
    expect(canAccessLead({ kind: 'owned', ownerId: N }, { id: A, role: 'sales' })).toBe(false);
  });

  it('a covering rep reaches the absent book', () => {
    expect(canAccessLead({ kind: 'owned', ownerId: N },
      { id: A, role: 'sales', coveringRepIds: [N] })).toBe(true);
  });

  it('cover reaches only the books it names', () => {
    const C = 'c3333333-3333-4333-8333-333333333333';
    expect(canAccessLead({ kind: 'owned', ownerId: C },
      { id: A, role: 'sales', coveringRepIds: [N] })).toBe(false);
  });

  it('cover cannot rescue an unresolvable owner', () => {
    // A failed read is not an absence. An owner we could not look up stays an
    // unanswered question, not a free lead.
    expect(canAccessLead({ kind: 'unresolvable', token: 'x' },
      { id: A, role: 'sales', coveringRepIds: [N] })).toBe(false);
    expect(canAccessLead({ kind: 'unavailable', reason: 'down' },
      { id: A, role: 'sales', coveringRepIds: [N] })).toBe(false);
  });

  it('absent by default — a caller that says nothing gets the old behaviour', () => {
    const authz = code('sales-authz.ts');
    expect(authz).toMatch(/\(principal\.coveringRepIds \?\? \[\]\)/);
  });
});

describe('cover moves nobody and writes nothing', () => {
  it('the cover module performs no database write at all', () => {
    const s = code('sales-absence-cover.ts');
    for (const w of ['update(', 'insert(', 'upsert(', 'delete(', 'owner_id']) {
      expect(s, `cover must not ${w} — it is access, not a transfer`).not.toContain(w);
    }
  });

  it('the deck computes cover fresh, so it expires at midnight by itself', () => {
    const q = code('call-queue.ts');
    expect(q).toContain('coveringFor(viewer.id');
    expect(q, 'cover must never be persisted').not.toMatch(/covering[\s\S]{0,60}\.insert\(/);
  });
});

describe('an absent book goes to one cover, not to everyone', () => {
  it('the deck picks the cover deterministically', () => {
    // Same function that keeps an unclaimed student in exactly one deck.
    const q = code('call-queue.ts');
    expect(q).toMatch(/coveringFor\([\s\S]{0,160}unclaimedDealtTo\(absentId, present\)/);
  });

  it('only a sales viewer covers — an admin already sees every book', () => {
    expect(code('call-queue.ts')).toMatch(/viewer\?\.role === 'sales' && seatCfg\.length > 1/);
  });
});

describe('an absence is a real absence, not a slow start or a day off', () => {
  it('a scheduled day off is never covered', () => {
    const s = code('sales-absence-cover.ts');
    expect(s).toMatch(/workDays[\s\S]{0,80}includes\(weekday\)/);
  });

  it('silence counts only once the shift is well under way', () => {
    const s = code('sales-absence-cover.ts');
    expect(s).toContain('COVER_AFTER_SHIFT_HOURS');
    expect(s).toMatch(/if \(seat\.workedToday > 0\) return false;/);
  });

  it('an unknown shift start is never guessed into an absence', () => {
    expect(code('sales-absence-cover.ts')).toMatch(/if \(into == null\) return false;/);
  });
});
