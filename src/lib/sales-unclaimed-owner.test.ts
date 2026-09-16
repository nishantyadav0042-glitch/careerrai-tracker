/**
 * ── One student, one deck ──────────────────────────────────────────────────
 *
 * Founder, 16 Sep 2026: "zero mixup between reps". 86 students were dealt to
 * BOTH reps on the same IST day in early September — none worked by both, so
 * no trust was spent, but each of them took a slot in two seventy-card days.
 */
import { describe, it, expect } from 'vitest';
import { unclaimedDealtTo, dealsUnclaimedTo } from './sales-unclaimed-owner';

const ANSHUL = 'a1111111-1111-4111-8111-111111111111';
const NEELAM = 'b2222222-2222-4222-8222-222222222222';
const SEATS = [ANSHUL, NEELAM];
const students = Array.from({ length: 400 }, (_, i) => `s-${i}-${i * 7919}`);

describe('an unclaimed student lands in exactly one deck', () => {
  it('never in both', () => {
    // THE DEFECT: the shared-book rule made every unclaimed student visible to
    // every rep, so both decks dealt them on the same morning.
    for (const s of students) {
      const forA = dealsUnclaimedTo(s, ANSHUL, SEATS);
      const forB = dealsUnclaimedTo(s, NEELAM, SEATS);
      expect(forA && forB, `${s} landed in both decks`).toBe(false);
    }
  });

  it('and never in neither, while a seat exists', () => {
    for (const s of students) {
      expect(dealsUnclaimedTo(s, ANSHUL, SEATS) || dealsUnclaimedTo(s, NEELAM, SEATS)).toBe(true);
    }
  });

  it('gives the same answer every time it is asked', () => {
    // Two page loads a second apart must not move a student between decks
    // mid-day. This is why the hash is stable rather than random.
    for (const s of students.slice(0, 50)) {
      const first = unclaimedDealtTo(s, SEATS);
      for (let i = 0; i < 5; i++) expect(unclaimedDealtTo(s, SEATS)).toBe(first);
    }
  });

  it('does not depend on the order the seats were read in', () => {
    for (const s of students.slice(0, 50)) {
      expect(unclaimedDealtTo(s, [ANSHUL, NEELAM])).toBe(unclaimedDealtTo(s, [NEELAM, ANSHUL]));
    }
  });

  it('splits the unowned pool roughly evenly', () => {
    // Not a fairness rule — a lopsided split would quietly hand one rep the
    // whole shared book, which is the starvation shape of Incident #78.
    const a = students.filter((s) => unclaimedDealtTo(s, SEATS) === ANSHUL).length;
    expect(a).toBeGreaterThan(students.length * 0.35);
    expect(a).toBeLessThan(students.length * 0.65);
  });
});

describe('it fails toward nobody, never toward everybody', () => {
  it('deals to no one when there are no seats', () => {
    // An unowned student with no seat is a data-quality exception with a
    // founder alert behind it — not a card to duplicate into every deck.
    expect(unclaimedDealtTo(students[0], [])).toBeNull();
    expect(dealsUnclaimedTo(students[0], ANSHUL, [])).toBe(false);
  });

  it('ignores empty seat ids rather than dealing to one', () => {
    expect(unclaimedDealtTo(students[0], ['', ''])).toBeNull();
    expect(unclaimedDealtTo(students[0], ['', ANSHUL])).toBe(ANSHUL);
  });

  it('a single seat takes them all', () => {
    for (const s of students.slice(0, 20)) expect(unclaimedDealtTo(s, [ANSHUL])).toBe(ANSHUL);
  });

  it('a duplicated seat is still one seat', () => {
    for (const s of students.slice(0, 20)) {
      expect(unclaimedDealtTo(s, [ANSHUL, ANSHUL, ANSHUL])).toBe(ANSHUL);
    }
  });
});
