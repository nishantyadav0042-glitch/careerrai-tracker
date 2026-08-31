import { describe, it, expect } from 'vitest';
import {
  pickKindForDay, reflectionForDay, ALL_KINDS, PICK_WEIGHTS, REFLECTION_PROMPTS,
  type PickAvailability, type PickKind,
} from './daily-pick-rotation';

// Daily Pick had twelve openers and zero votes on 12 Aug because one repeated
// ask cannot carry a habit. The rotation is the fix, and it has exactly three
// ways to fail: it can reroll under a student mid-day, it can offer a slot it
// cannot fill, or it can settle into repeating one kind — which would recreate
// the original problem with more code.

const ALL_AVAILABLE: PickAvailability = {
  community: true, mirror: true, peer: true, reflection: true,
};
const none = (over: Partial<PickAvailability> = {}): PickAvailability => ({
  community: false, mirror: false, peer: false, reflection: false, ...over,
});

describe('the day cannot be rerolled underneath the student', () => {
  it('is stable for a given student and day', () => {
    const a = pickKindForDay('s1', '2026-08-12', ALL_AVAILABLE);
    for (let i = 0; i < 50; i++) {
      expect(pickKindForDay('s1', '2026-08-12', ALL_AVAILABLE)).toBe(a);
    }
  });

  it('changes across days, so the surface is not frozen', () => {
    const days = ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16', '2026-08-17'];
    const kinds = new Set(days.map((d) => pickKindForDay('s1', d, ALL_AVAILABLE)));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('gives different students different days — no synchronised surface', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `student-${i}`);
    const kinds = new Set(ids.map((id) => pickKindForDay(id, '2026-08-12', ALL_AVAILABLE)));
    expect(kinds.size).toBeGreaterThan(1);
  });
});

describe('it never offers a slot it cannot fill', () => {
  it('only ever returns an AVAILABLE kind, across many students and days', () => {
    const avail = none({ reflection: true, peer: true });
    for (let i = 0; i < 200; i++) {
      const k = pickKindForDay(`s${i}`, `2026-08-${(i % 28) + 1}`.padStart(10, '0'), avail);
      expect(['reflection', 'peer']).toContain(k);
    }
  });

  it('returns the single available kind when only one exists', () => {
    expect(pickKindForDay('s1', '2026-08-12', none({ reflection: true }))).toBe('reflection');
  });

  it('returns null when nothing at all can be filled', () => {
    expect(pickKindForDay('s1', '2026-08-12', none())).toBeNull();
  });

  it('a brand-new student with no data still gets something', () => {
    // Day one: no logs, no cohort, no voting history. Reflection is the floor.
    expect(pickKindForDay('new', '2026-08-12', none({ reflection: true }))).toBe('reflection');
  });
});

describe('it does not settle into one kind — the original failure', () => {
  it('breaks a two-day repeat rather than serving the same ask a third time', () => {
    for (const k of ALL_KINDS) {
      const got = pickKindForDay('s1', '2026-08-12', ALL_AVAILABLE, [k, k]);
      expect(got).not.toBe(k);
    }
  });

  it('still serves the repeat if it is genuinely the only thing available', () => {
    // Correctness beats variety: an empty screen is worse than a repeated one.
    expect(pickKindForDay('s1', '2026-08-12', none({ reflection: true }), ['reflection', 'reflection']))
      .toBe('reflection');
  });

  it('spreads across the whole population roughly in proportion to weight', () => {
    const counts = new Map<PickKind, number>();
    for (let i = 0; i < 3000; i++) {
      const k = pickKindForDay(`student-${i}`, '2026-08-12', ALL_AVAILABLE)!;
      counts.set(k, (counts.get(k) ?? 0) + 1);
    }
    // Every kind must actually appear — a weight that never fires is a bug.
    for (const k of ALL_KINDS) expect(counts.get(k) ?? 0).toBeGreaterThan(0);
    // The mirror leads now: with the question kind removed (31 Aug), the
    // heaviest remaining ask is the one built from the student's own data.
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
    expect(top[0]).toBe('mirror');
  });

  it('never serves one kind for a long run of consecutive days', () => {
    // The bug this pins: dailyPickIndex is a rolling hash, so consecutive dates
    // hash to consecutive-ish numbers. Against a BLOCKED weight deck that meant
    // a student drew 'question' for ~40 days straight — the exact "one repeated
    // ask" failure the rotation exists to cure. The deck is interleaved to stop
    // it; if anyone rewrites it as cumulative ranges, this fails.
    const days: string[] = [];
    for (let d = 1; d <= 28; d++) days.push(`2026-09-${String(d).padStart(2, '0')}`);

    for (const student of ['s1', 's2', 's3', 'abhishek', 'dhruv']) {
      const seq = days.map((d) => pickKindForDay(student, d, ALL_AVAILABLE));
      let longest = 1, run = 1;
      for (let i = 1; i < seq.length; i++) {
        run = seq[i] === seq[i - 1] ? run + 1 : 1;
        if (run > longest) longest = run;
      }
      expect(longest, `${student} got the same pick ${longest} days running`).toBeLessThanOrEqual(4);
      // And they must genuinely see variety across a month, not two kinds.
      expect(new Set(seq).size).toBeGreaterThanOrEqual(3);
    }
  });

  it('weights are positive, and the mirror leads now that the question is gone', () => {
    for (const k of ALL_KINDS) expect(PICK_WEIGHTS[k]).toBeGreaterThan(0);
    for (const k of ALL_KINDS) {
      if (k !== 'mirror') expect(PICK_WEIGHTS.mirror).toBeGreaterThan(PICK_WEIGHTS[k]);
    }
  });

  // The founder's 31 Aug instruction, asserted against the engine itself:
  // 'question' must not be reachable as a kind by ANY availability input.
  it('can never serve a question, whatever is available', () => {
    const kinds = new Set<string>();
    for (let d = 1; d <= 28; d++) {
      const day = `2026-09-${String(d).padStart(2, '0')}`;
      for (const student of ['s1', 's2', 's3', 's4', 's5']) {
        const k = pickKindForDay(student, day, ALL_AVAILABLE);
        if (k) kinds.add(k);
      }
    }
    expect(kinds.has('question')).toBe(false);
    expect(ALL_KINDS as string[]).not.toContain('question');
  });
});

describe('reflection prompts — the floor the rotation cannot fall through', () => {
  it('is stable per student per day and varies across days', () => {
    const a = reflectionForDay('s1', '2026-08-12');
    expect(reflectionForDay('s1', '2026-08-12')).toBe(a);
    const across = new Set(
      ['2026-08-12', '2026-08-13', '2026-08-14', '2026-08-15', '2026-08-16'].map((d) => reflectionForDay('s1', d))
    );
    expect(across.size).toBeGreaterThan(1);
  });

  it('always returns a real prompt from the list', () => {
    for (let i = 0; i < 100; i++) {
      expect(REFLECTION_PROMPTS).toContain(reflectionForDay(`s${i}`, '2026-08-12'));
    }
  });

  it('never asks a student to justify themselves or predict a score', () => {
    for (const p of REFLECTION_PROMPTS) {
      for (const forbidden of ['why did you fail', 'why not', 'percentile', 'rank', 'score you expect']) {
        expect(p.toLowerCase()).not.toContain(forbidden);
      }
      // Answerable in a sentence: one question mark, not an interrogation.
      expect(p.split('?').length - 1).toBeLessThanOrEqual(2);
    }
  });
});
