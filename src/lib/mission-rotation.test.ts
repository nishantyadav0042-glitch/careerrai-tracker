import { describe, it, expect } from 'vitest';

// Founder, 6 Aug: "most of the students are repeating only... change the pool
// at least alternate days" and "message who opened the app, or want a buddy,
// or tried to login, or at least put in 0.1".
//
// The queue looked personalised and was actually frozen: `rank` is a pure
// function of facts that don't change day to day, and the only thing that
// removed a student was having already MESSAGED them. So opening the page two
// nights running showed the same 45 names in the same order.
//
// These tests pin the two properties that fix it.

const ROTATION_POOLS = 2;

/** Mirrors rotationBucket() in mission-queue.ts. */
function rotationBucket(studentId: string): number {
  let h = 0;
  for (let i = 0; i < studentId.length; i++) h = (h * 31 + studentId.charCodeAt(i)) | 0;
  return Math.abs(h) % ROTATION_POOLS;
}

/** Mirrors istDayIndex(). */
function istDayIndex(nowMs: number): number {
  return Math.floor((nowMs + 5.5 * 3_600_000) / 86_400_000);
}

interface Student { id: string; intent: boolean }

/** Mirrors the eligibility gate. */
function eligible(s: Student, nowMs: number): boolean {
  if (s.intent) return true;
  return rotationBucket(s.id) === istDayIndex(nowMs) % ROTATION_POOLS;
}

const DAY = 86_400_000;
const NIGHT_1 = Date.parse('2026-08-06T20:00:00+05:30');
const NIGHT_2 = NIGHT_1 + DAY;

const cold = (n: number): Student[] =>
  Array.from({ length: n }, (_, i) => ({ id: `cold-${i}-uuid-abcdef`, intent: false }));

describe('the cold tail changes on alternate days', () => {
  it('shows a different set tonight than tomorrow night', () => {
    const pool = cold(200);
    const tonight = pool.filter((s) => eligible(s, NIGHT_1)).map((s) => s.id);
    const tomorrow = pool.filter((s) => eligible(s, NIGHT_2)).map((s) => s.id);

    expect(tonight.length).toBeGreaterThan(0);
    expect(tomorrow.length).toBeGreaterThan(0);
    // The whole complaint: these two lists used to be identical.
    expect(tomorrow).not.toEqual(tonight);
    // And they must not merely be reordered — genuinely different people.
    expect(tonight.some((id) => !tomorrow.includes(id))).toBe(true);
  });

  it('splits the tail roughly in half rather than starving one side', () => {
    const pool = cold(400);
    const n1 = pool.filter((s) => eligible(s, NIGHT_1)).length;
    const n2 = pool.filter((s) => eligible(s, NIGHT_2)).length;
    expect(n1 + n2).toBe(pool.length);
    for (const n of [n1, n2]) {
      expect(n).toBeGreaterThan(pool.length * 0.3);
      expect(n).toBeLessThan(pool.length * 0.7);
    }
  });

  it('puts the same student in the same bucket every time it is asked', () => {
    // Rotation must be stable, or a student could be skipped forever by
    // landing in the "other" pool on every single run.
    const id = 'stable-student-uuid';
    const seen = new Set(Array.from({ length: 50 }, () => rotationBucket(id)));
    expect(seen.size).toBe(1);
  });

  it('comes back around — a student excluded tonight is included tomorrow', () => {
    const s: Student = { id: 'cold-42-uuid-abcdef', intent: false };
    expect([eligible(s, NIGHT_1), eligible(s, NIGHT_2)].filter(Boolean)).toHaveLength(1);
  });
});

describe('intent is never rotated out', () => {
  it('shows a student who tried to pay on BOTH nights', () => {
    // Someone who reached checkout and stopped is the strongest signal in the
    // product. Hiding them for a day to "rotate the pool" would be absurd.
    const hot: Student = { id: 'cold-7-uuid-abcdef', intent: true };
    expect(eligible(hot, NIGHT_1)).toBe(true);
    expect(eligible(hot, NIGHT_2)).toBe(true);
  });

  it('holds even for an id whose bucket is not today’s', () => {
    const pool = cold(100).map((s) => ({ ...s, intent: true }));
    expect(pool.every((s) => eligible(s, NIGHT_1))).toBe(true);
    expect(pool.every((s) => eligible(s, NIGHT_2))).toBe(true);
  });
});

describe('the day flips at IST midnight, not UTC', () => {
  it('treats 11pm and 1am IST as different days', () => {
    const before = Date.parse('2026-08-06T23:00:00+05:30');
    const after = Date.parse('2026-08-07T01:00:00+05:30');
    expect(istDayIndex(after)).toBe(istDayIndex(before) + 1);
  });

  it('does NOT flip in the middle of an Indian evening', () => {
    // A founder working the queue from 6pm to 10pm must not see the pool
    // change under them.
    const six = Date.parse('2026-08-06T18:00:00+05:30');
    const ten = Date.parse('2026-08-06T22:00:00+05:30');
    expect(istDayIndex(six)).toBe(istDayIndex(ten));
  });
});
