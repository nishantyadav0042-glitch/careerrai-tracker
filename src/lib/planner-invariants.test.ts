import { describe, it, expect } from 'vitest';
import { chooseTopicsForSection, type TopicCandidateInput } from './topic-selector';
import { syllabusPace, MAX_NEW_TOPIC_URGENCY } from './syllabus-pace';
import { TOPICS_BY_SECTION } from './coverage-validate';
import { MAX_TOPIC_BLOCKS_PER_SECTION } from './routine-engine';

// ── Does the 46/46 guarantee come from the MODEL, or from one lucky number? ──
//
// Founder, 11 Aug: "test +28 se +20 karke dekho guarantee tootti hai kya… is
// 46 topics build for ALL now?"
//
// The right question, and the one the Abhishek fix left unanswered. His case
// was fixed against his own data; if the guarantee only holds at the exact
// weights that fixed him, the architecture is still wrong and the next student
// with different hours or a different deadline falls through the same hole.
//
// So this walks the REAL engine day by day for many students, not one.

const SECTIONS = ['VARC', 'DILR', 'QA'] as const;

interface Profile {
  name: string;
  days: number;
  /** Blocks per section per day — what the hours buy (routine-engine). */
  blocks: number;
  /** Topics already opened before the window starts, per section. */
  seeded: number;
}

/**
 * Run a student's whole remaining window through the real selector.
 * `urgencyScale` simulates a different MAX_NEW_TOPIC_URGENCY: urgency is linear
 * in pressure, so scaling the pressure fed to the selector is exactly
 * equivalent to lowering the constant.
 */
function walk(p: Profile, urgencyScale = 1) {
  const pool: Record<string, TopicCandidateInput[]> = {};
  for (const s of SECTIONS) {
    pool[s] = (TOPICS_BY_SECTION[s] as string[]).map((topic, i) => ({
      topic,
      coverageStatus: i < p.seeded ? ('revising' as const) : ('not_started' as const),
      daysSinceLastPracticed: i < p.seeded ? 2 : null,
      daysSincePlanned: i < p.seeded ? 2 : null,
    }));
  }

  const served: Record<string, number> = {};
  for (let day = 0; day < p.days; day++) {
    for (const s of SECTIONS) {
      const untouched = pool[s].filter((c) => c.coverageStatus === 'not_started').length;
      const pace = syllabusPace({ untouchedTopics: untouched, daysToTarget: p.days - day });
      const picks = chooseTopicsForSection(
        pool[s], p.blocks, 1, false, Math.min(1, pace.pressure * urgencyScale)
      );
      const chosen = new Set(picks.map((x) => x.topic));
      for (const x of picks) served[x.topic] = (served[x.topic] ?? 0) + 1;
      for (const c of pool[s]) {
        if (chosen.has(c.topic)) {
          c.daysSincePlanned = 0;
          c.daysSinceLastPracticed = 0;
          if (c.coverageStatus === 'not_started') c.coverageStatus = 'learning';
        } else {
          if (c.daysSincePlanned != null) c.daysSincePlanned++;
          if (c.daysSinceLastPracticed != null) c.daysSinceLastPracticed++;
        }
      }
    }
  }

  let opened = 0, total = 0;
  for (const s of SECTIONS) {
    total += pool[s].length;
    opened += pool[s].filter((c) => c.coverageStatus !== 'not_started').length;
  }
  const slots = Object.values(served).reduce((a, b) => a + b, 0);
  const worst = Math.max(0, ...Object.values(served));
  return { opened, total, complete: opened === total, worstShare: slots ? worst / slots : 0 };
}

// Capacity a real day buys. 3 blocks = the 11h student; 1 block = the ~2-3h one.
const PROFILES: Profile[] = [
  { name: 'Abhishek — 11h, 25 days', days: 25, blocks: 3, seeded: 5 },
  { name: 'high hours, tight deadline', days: 20, blocks: 3, seeded: 0 },
  { name: 'high hours, long runway', days: 60, blocks: 3, seeded: 0 },
  { name: 'mid hours (2 blocks), 30 days', days: 30, blocks: 2, seeded: 3 },
  { name: 'mid hours, tight 18 days', days: 18, blocks: 2, seeded: 0 },
  { name: 'low hours (1 block), 45 days', days: 45, blocks: 1, seeded: 0 },
  { name: 'low hours, mostly opened', days: 20, blocks: 1, seeded: 8 },
  { name: 'fresh start, 90 days', days: 90, blocks: 2, seeded: 0 },
];

describe('the 46/46 guarantee — is it the model or the number?', () => {
  it('holds for every student profile at the shipped weight', () => {
    const broken = PROFILES.map((p) => ({ p, r: walk(p) })).filter((x) => !x.r.complete);
    expect(
      broken.map((x) => `${x.p.name}: ${x.r.opened}/${x.r.total}`),
      'a profile finished the window with syllabus never opened'
    ).toEqual([]);
  });

  // THE question. If the guarantee evaporates when the constant moves, it was
  // never a guarantee — it was a coincidence tuned to one student.
  it('survives +28 → +20, and every weight down to +14', () => {
    const results: string[] = [];
    for (const scale of [20 / 28, 18 / 28, 16 / 28, 14 / 28]) {
      const weight = Math.round(MAX_NEW_TOPIC_URGENCY * scale);
      for (const p of PROFILES) {
        const r = walk(p, scale);
        if (!r.complete) results.push(`+${weight} · ${p.name}: ${r.opened}/${r.total}`);
      }
    }
    expect(results, 'lowering the new-topic weight left syllabus unopened').toEqual([]);
  });

  it('no single topic can eat the plan, at any weight', () => {
    for (const scale of [1, 20 / 28, 14 / 28]) {
      for (const p of PROFILES) {
        const r = walk(p, scale);
        expect(r.worstShare, `${p.name} @ scale ${scale.toFixed(2)}`).toBeLessThan(0.25);
      }
    }
  });

  // Invariant 4: more hours must not produce LESS syllabus progression.
  it('more hours never means less progress', () => {
    for (const days of [20, 30, 45]) {
      const one = walk({ name: '1', days, blocks: 1, seeded: 0 }).opened;
      const two = walk({ name: '2', days, blocks: 2, seeded: 0 }).opened;
      const three = walk({ name: '3', days, blocks: MAX_TOPIC_BLOCKS_PER_SECTION, seeded: 0 }).opened;
      expect(two, `${days}d: 2 blocks < 1 block`).toBeGreaterThanOrEqual(one);
      expect(three, `${days}d: 3 blocks < 2 blocks`).toBeGreaterThanOrEqual(two);
    }
  });

  // Invariant 10: same input, same plan.
  it('is deterministic', () => {
    const a = walk(PROFILES[0]);
    const b = walk(PROFILES[0]);
    expect(a).toEqual(b);
  });
});
