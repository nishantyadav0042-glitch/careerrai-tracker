import { describe, it, expect } from 'vitest';
import { computeDailyInsight, insightKey, type DailyInsight } from './daily-insight';

/**
 * ── THE FALLBACK MUST ROTATE TOO ────────────────────────────────────────────
 *
 * Founder, 2 Sep 2026: "the daily insight must change daily — not the same
 * one for five days, not for two." Production, measured from the send ledger
 * (one row per push, never overwritten) for 28 Aug → 2 Sep, i.e. AFTER the
 * Incident #37 fix:
 *
 *   🎯 RAI noticed a gap        74 sends   0 consecutive-day repeats
 *   📊 A pattern in your week   43 sends   0
 *   🔁 One topic is fading      13 sends   0
 *   🔥 Your consistency…         2 sends   0
 *   📈 Your map is filling in   27 sends   7 repeats, 5 students
 *
 * Every observation rule rotated. The one thing still repeating was the
 * `progress` fallback — exempt from suppression by design, one sentence,
 * reading topic_coverage, which does not move on a quiet day. So a student
 * with nothing new to observe got the identical card until something changed.
 *
 * The fallback is now a FAMILY of lines, each keyed `progress:<member>` and
 * suppressed exactly like an observation. Only when every member has already
 * been shown this week does the first one return — that single last resort
 * is all that remains of the old exemption, and it is what keeps a quiet
 * week from blanking the card.
 */

/** A chainable, thenable fake for the three tables computeDailyInsight reads. */
function adminWith(rows: Record<string, unknown[]>) {
  return {
    from: (table: string) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const q: any = {
        select: () => q, eq: () => q, gte: () => q, gt: () => q, lt: () => q,
        then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows[table] ?? [], error: null }).then(res),
      };
      return q;
    },
  };
}

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().split('T')[0];

// Three logged days (≥2, so an insight is computed) but only two in the last
// five (so the consistency rule stays quiet); no routines and no completions,
// so recovery and avoidance have nothing to say; every open topic is a
// low-weightage one, so the core-topic rule does not fire. Nothing to observe:
// the family is what this student gets.
const REPORTS = [{ report_date: day(1) }, { report_date: day(3) }, { report_date: day(9) }];
// All weightage ≤ 3 in TOPIC_METADATA — the core-topic rule (rule 3) only
// speaks for weightage ≥ 4, so it stays silent and the family is reached.
const TOPIC_MEMORY = [
  { topic: 'Para Jumbles', status: 'not_started', revisionOverdue: false, lastTouchedDaysAgo: null },
  { topic: 'Odd One Out', status: 'not_started', revisionOverdue: false, lastTouchedDaysAgo: null },
  { topic: 'Para Summary', status: 'not_started', revisionOverdue: false, lastTouchedDaysAgo: null },
];

async function insightWith(suppressed: string[]): Promise<DailyInsight | null> {
  return computeDailyInsight(
    adminWith({ daily_reports: REPORTS, daily_routines: [], routine_task_completions: [] }),
    'stu-1',
    { isRepeater: false, isWorkingProfessional: false },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    { topicMemory: TOPIC_MEMORY as any },
    { suppressedKeys: new Set(suppressed) },
  );
}

describe('a student with nothing new to observe still gets a DIFFERENT line each day', () => {
  it('day 1: the map line', async () => {
    const i = await insightWith([]);
    expect(i?.kind).toBe('progress');
    expect(insightKey(i!)).toBe('progress:map');
  });

  it('day 2: the map line is suppressed, so the days line', async () => {
    const i = await insightWith(['progress:map']);
    expect(insightKey(i!)).toBe('progress:days');
  });

  it('day 3: the thinnest section', async () => {
    const i = await insightWith(['progress:map', 'progress:days']);
    expect(insightKey(i!)).toBe('progress:section:VARC');
    expect(i!.text).toContain('VARC');
  });

  it('day 4: the next topic on the map', async () => {
    const i = await insightWith(['progress:map', 'progress:days', 'progress:section:VARC']);
    expect(insightKey(i!)).toBe('progress:next:Para Jumbles');
  });

  it('REGRESSION: with the map line suppressed, the map line must NOT come back', async () => {
    // The old exempt fallback returned `progress:map` no matter what was in
    // the suppressed set — this is the exact behaviour the 7-of-27 repeats
    // came from. Demonstrated rather than described.
    const i = await insightWith(['progress:map']);
    expect(insightKey(i!)).not.toBe('progress:map');
  });

  it('the last resort: every member shown this week → the first returns, never null', async () => {
    // The reason the old exemption existed, kept — a quiet week must not
    // blank the card. It is now the ONLY path that repeats, and it needs four
    // prior distinct shows to reach.
    const i = await insightWith([
      'progress:map', 'progress:days', 'progress:section:VARC', 'progress:next:Para Jumbles',
    ]);
    expect(i).not.toBeNull();
    expect(insightKey(i!)).toBe('progress:map');
  });
});

describe('day 0: a brand-new student gets an insight, and never a guilt line', () => {
  // Founder, 2 Sep: "2 din rule hata do" — the Home card was invisible until
  // the second log. The onboarding coverage matrix is real data on day 0.
  const dayZero = (suppressed: string[], routines: unknown[] = []) =>
    computeDailyInsight(
      adminWith({ daily_reports: [], daily_routines: routines, routine_task_completions: [] }),
      'stu-new',
      { isRepeater: false, isWorkingProfessional: false },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { topicMemory: TOPIC_MEMORY as any },
      { suppressedKeys: new Set(suppressed) },
    );

  it('REGRESSION: zero logged days no longer returns null', async () => {
    expect(await dayZero([])).not.toBeNull();
  });

  it('the "days logged" member does not exist at zero — "0 of 14 logged" is guilt, not insight', async () => {
    const i = await dayZero(['progress:map']);
    expect(insightKey(i!)).toBe('progress:section:VARC');
  });

  it("a plan served today and untouched is NOT 'a pattern in your week'", async () => {
    // Four QA tasks served, none done, no logs yet: the avoidance rule would
    // have fired on day 0 — the exact false observation the old door-level
    // gate was (accidentally) preventing. It is now gated where it belongs.
    const served = [{ routine_date: day(0), tasks: [1, 2, 3, 4].map((n) => ({ id: `t${n}`, section: 'QA', topic: null })) }];
    const i = await dayZero([], served);
    expect(i!.kind).not.toBe('avoidance');
  });
});

describe('every member of the family honours the language contract', () => {
  // The 20 Aug rules that daily-insight-honesty.guard.test.ts pins for the
  // observation rules apply to the fallback family too: the student's own
  // numbers only, no percentages, no exam volume, no internal rating shown.
  const MEMBERS: DailyInsight[] = [];
  it('collect', async () => {
    const keys: string[] = [];
    for (let n = 0; n < 4; n++) {
      const i = await insightWith(keys);
      MEMBERS.push(i!);
      keys.push(insightKey(i!));
    }
    expect(new Set(keys).size, 'four members, four distinct keys').toBe(4);
  });

  it('fits the one-line budget', () => {
    for (const m of MEMBERS) expect(m.text.length, m.text).toBeLessThanOrEqual(105);
  });

  it('no percentage, no question or marks count, no rating word', () => {
    for (const m of MEMBERS) {
      const t = `${m.title} ${m.text}`;
      expect(/%/.test(t), t).toBe(false);
      expect(/\d+\s*(questions?|marks)\b/i.test(t), t).toBe(false);
      expect(t).not.toContain('weightage');
      expect(/top marks|most important topic|guaranteed/i.test(t), t).toBe(false);
    }
  });
});
