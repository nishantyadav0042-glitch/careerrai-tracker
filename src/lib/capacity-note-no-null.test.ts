import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeCapacity } from './capacity-engine';

// ── The capacity note must never render a null into a sentence ──────────────
//
// Live defect: the admin 360 page renders `capacity.note`, and the note
// interpolates two values that are legitimately nullable:
//
//   `Studies ~${typical}h on active days (entered ${claimedHours}h). ...`
//
// `typical` is `typicalStudyHours: number | null` — the MEDIAN OF PRODUCTIVE
// DAYS, which is null when the productive set is empty. `claimedHours` is
// `dailyHours().weekday`, also `number | null`. Either produces the string
// "nullh" in front of the founder.
//
// PRODUCTION (measured): 1 student is in the `~nullh` state today. The
// claimedHours leak is currently unreachable (every student has claimed hours)
// but is reachable by the type contract, and it sits in the same expression —
// fixing one and leaving the other would be leaving a loaded gun.
//
// WHAT THIS IS *NOT*. `typical === null` here does not mean "unknown". Since
// Q4, `loggedDays` counts only MEASURED days, so this state is: five or more
// days we could measure, and not one of them had any study hours. That is a
// real, known finding — so the honest copy says so, rather than borrowing the
// "not enough data yet" wording, which would claim ignorance we do not have.
// The UNKNOWN principle is about not inventing evidence; it is not a licence to
// describe known-zero as unmeasured.
//
// SCOPE: the STRING only. Every number computeCapacity returns is unchanged —
// including the 0.5 behaviour floor, which is a capacity-calculation decision
// and explicitly out of scope.

const src = readFileSync(join(process.cwd(), 'src/lib/capacity-engine.ts'), 'utf8');

/** Five measured days, none of them productive: typical is null. */
const noProductiveDays = () => computeCapacity([0, 0, 0, 0, 0], 5, 6);

describe('no null, NaN or undefined can reach the sentence', () => {
  it('the zero-productive-days note does not say "nullh"', () => {
    const c = noProductiveDays();
    expect(c.note).not.toMatch(/null/i);
    expect(c.note).not.toMatch(/NaN/);
    expect(c.note).not.toMatch(/undefined/i);
  });

  it('a missing claimed-hours figure does not say "nullh" either', () => {
    // Latent today (every student has claimed hours) but reachable by type.
    for (const c of [computeCapacity([0, 0, 0, 0, 0], 5, null), computeCapacity([4, 4, 4, 4, 4], 5, null)]) {
      expect(c.note).not.toMatch(/null/i);
      expect(c.note).not.toMatch(/NaN/);
    }
  });

  it('no reachable input produces a broken note', () => {
    const inputs: [number[], number, number | null][] = [
      [[], 0, 6], [[], 0, null], [[0], 1, 6], [[0, 0, 0, 0, 0], 5, 6],
      [[0, 0, 0, 0, 0], 5, null], [[4, 4, 4, 4, 4], 5, 6], [[4, 4, 4, 4, 4], 5, null],
      [[0, 0, 0, 0, 0, 4], 6, 6], [[8, 8, 8], 3, 1],
    ];
    for (const [hrs, days, claimed] of inputs) {
      const c = computeCapacity(hrs, days, claimed);
      expect(c.note, `hrs=${JSON.stringify(hrs)} days=${days} claimed=${claimed}`)
        .not.toMatch(/null|NaN|undefined/i);
    }
  });
});

describe('the zero-productive-days note tells the truth', () => {
  it('says no hours were recorded, rather than claiming we lack data', () => {
    // We HAVE the data — five measured days of zero. Saying "not enough data"
    // would be a different lie from "~nullh", not a fix for it.
    const c = noProductiveDays();
    expect(c.note.toLowerCase()).toMatch(/no study hours|no hours/);
    expect(c.note, 'and it must not borrow the unknown-evidence wording')
      .not.toMatch(/not enough data/i);
  });

  it('still names the claimed figure it is contradicting', () => {
    expect(noProductiveDays().note).toContain('6');
  });
});

describe('every number is unchanged — this is a copy fix', () => {
  it('the zero-productive case keeps its exact computed values', () => {
    const c = noProductiveDays();
    expect(c.typicalStudyHours).toBeNull();
    expect(c.sustainableHours, 'the 0.5 behaviour floor is a capacity decision, out of scope').toBe(0.5);
    expect(c.trust).toBe('behaviour');
    expect(c.loggedDays).toBe(5);
    expect(c.claimedHours).toBe(6);
  });

  it('the normal behaviour and input notes are untouched', () => {
    const behaviour = computeCapacity([2, 2, 2, 2, 2], 5, 6);
    expect(behaviour.note).toContain('Studies ~2h on active days');
    expect(behaviour.trust).toBe('behaviour');
    const input = computeCapacity([6, 6, 6, 6, 6], 5, 6);
    expect(input.note).toBe('Behaviour matches the 6h entered.');
  });

  it('the too-early note is untouched — it already guarded its own null', () => {
    expect(computeCapacity([4], 1, 6).note).toContain('Too early to judge');
    expect(computeCapacity([4], 1, null).note, 'the ?? "?" precedent this fix follows')
      .toContain("?h entered");
  });

  it('the engine arithmetic is untouched', () => {
    expect(src).toContain('const MIN_DAYS_FOR_BEHAVIOUR = 5;');
    expect(src).toContain('recentStudyHours.filter((h) => h > 0)');
    expect(src).toContain('const behaviour = typical ?? 0.5;');
    expect(src).toContain('claimedHours != null ? round2(Math.min(claimedHours, behaviour))');
  });
});
