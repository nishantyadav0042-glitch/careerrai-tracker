import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSummary } from './analytics';
import type { DailyReport } from '@/types';

// ── Q3 — no usable duration is UNKNOWN, never 0 hours ───────────────────────
//
// Founder ruling: "No known duration != 0 hours." Student-facing analytics must
// say "Not enough data yet" rather than fabricate 0h, and such unknowns must
// not trigger zero-duration flags.
//
// THIS IS THE THIRD TIME THIS EXACT BUG HAS APPEARED:
//   J2  — avg([]) === 0 fired a sleep-quality flag 26 times at students who had
//         logged nothing at all.
//   A3  — study_duration > 0 read 62 declared study days as non-study days.
//   Q3  — avg() over unknown durations reports 0h and red-flags the student.
//
// Same disease every time: absence of evidence rendered as a confident number.
//
// PRODUCTION (measured): 24 students have NO usable duration evidence and are
// currently reported at 0h; 10 more are red-flagged only because unknown days
// are averaged in as zero.
//
// A REAL ZERO IS NOT UNKNOWN. Rest days and explicit "didn't study" are 0 and
// must keep counting as 0 — otherwise a student could dodge every flag by
// honestly reporting bad days. The pair decides (G6), never the source alone.

const row = (over: Partial<DailyReport>): DailyReport => ({
  id: 'x', student_id: 's', report_date: '2026-08-10', study_duration: 0,
  topics_covered: [], mock_taken: false, notes: null, mood_emoji: '💪',
  ...over,
} as DailyReport);

const unknownDay = (d: string) => row({
  report_date: d, study_duration: 0, day_outcome: 'studied', study_duration_source: 'not_collected',
} as Partial<DailyReport>);

const realZeroDay = (d: string) => row({
  report_date: d, study_duration: 0, day_outcome: 'not_studied', study_duration_source: 'not_collected',
} as Partial<DailyReport>);

const studiedDay = (d: string, h: number) => row({
  report_date: d, study_duration: h, day_outcome: 'studied', study_duration_source: 'credited',
} as Partial<DailyReport>);

describe('a student with no usable duration evidence', () => {
  const reports = ['2026-08-10', '2026-08-11', '2026-08-12'].map(unknownDay);

  it('reports UNKNOWN, not 0 hours', () => {
    expect(computeSummary(reports, 7).avgStudy).toBeNull();
  });

  it('is NOT red-flagged for low study hours', () => {
    const flags = computeSummary(reports, 7).redFlags;
    expect(flags.some((f) => f.includes('Avg study below'))).toBe(false);
  });

  it('still gets flags that do not depend on duration', () => {
    // "Going quiet" counts REPORTS, not hours — it is unaffected and must stay.
    expect(computeSummary(reports, 7).redFlags.some((f) => f.includes('going quiet'))).toBe(true);
  });
});

describe('a real zero is still a real zero', () => {
  const reports = ['2026-08-10','2026-08-11','2026-08-12','2026-08-13','2026-08-14'].map(realZeroDay);

  it('averages to 0, not UNKNOWN', () => {
    expect(computeSummary(reports, 7).avgStudy).toBe(0);
  });

  it('IS red-flagged — honestly reporting bad days must not dodge the flag', () => {
    expect(computeSummary(reports, 7).redFlags.some((f) => f.includes('Avg study below'))).toBe(true);
  });
});

describe('mixed evidence uses only the days it can measure', () => {
  it('averages over known days alone', () => {
    const reports = [studiedDay('2026-08-10', 4), studiedDay('2026-08-11', 2), unknownDay('2026-08-12')];
    // 6h over TWO measured days = 3, not 6/3 = 2.
    expect(computeSummary(reports, 7).avgStudy).toBe(3);
  });

  it('counts a real zero in the denominator', () => {
    const reports = [studiedDay('2026-08-10', 4), realZeroDay('2026-08-11')];
    expect(computeSummary(reports, 7).avgStudy).toBe(2);
  });

  it('legacy rows (no source) are used as-is — J6-A forbids reinterpreting them', () => {
    const legacy = [row({ report_date: '2026-08-10', study_duration: 3 }), row({ report_date: '2026-08-11', study_duration: 1 })];
    expect(computeSummary(legacy, 7).avgStudy).toBe(2);
  });
});

describe('totalStudy is a SUM and stays a number', () => {
  it('an unknown day adds nothing but does not make the total unknown', () => {
    // Summing known hours is still meaningful when some days are unmeasured —
    // "at least this much" is true. Only the AVERAGE is corrupted by dividing
    // by days we could not measure.
    const reports = [studiedDay('2026-08-10', 4), unknownDay('2026-08-11')];
    expect(computeSummary(reports, 7).totalStudy).toBe(4);
  });
});

describe('the surfaces that show an AVERAGE say when they cannot', () => {
  const code = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

  it('the student\'s own history shows a TOTAL, so it needs no unknown copy', () => {
    // Checked rather than assumed: history-section renders summary.totalStudy,
    // a sum. "At least this much" stays true with unmeasured days in the
    // window, so there is nothing to hedge and nothing to change here.
    const s = code('src/app/student/profile/history-section.tsx');
    expect(s).toContain('summary.totalStudy.toFixed(1)');
    expect(s, 'and it must not start showing an average without the unknown case')
      .not.toContain('summary.avgStudy');
  });

  it('the buddy view uses the shared average instead of dividing by all days', () => {
    // It computed `totalStudy / daysSubmitted` itself — a FOURTH average,
    // bypassing computeSummary, dividing known hours by every logged day
    // including the unmeasured ones. One calculation, one place.
    const s = code('src/app/buddy/(dashboard)/students/[id]/page.tsx');
    expect(s, 'the private division must be gone')
      .not.toContain('summary.totalStudy / summary.daysSubmitted');
    expect(s).toContain('summary.avgStudy');
    expect(s, 'and it must say so when there is nothing to average')
      .toContain('Not enough data yet');
  });
});

describe('scope containment', () => {
  it('the empty-array helper no longer silently returns 0', () => {
    const src = readFileSync(join(process.cwd(), 'src/lib/analytics.ts'), 'utf8');
    expect(src, 'the J2 shape — if (!arr.length) return 0 — must be gone from the duration path')
      .toMatch(/avgOrNull|return null/);
  });

  it('KNOWN GAP, deliberately not decided here: overallScore still scores an unknown as 0', () => {
    // overallScore = consistency + studyScore + mockScore + moodScore, and
    // studyScore is (avgStudy / 6) * 25. With avgStudy unknown there is no
    // ruled answer for what a 0-25 component should contribute, and inventing
    // one would be exactly what J6-A forbids. The ruling covered the displayed
    // average and the flags; the composite score was not ruled. Pinned so the
    // gap is visible rather than discovered later.
    const reports = ['2026-08-10','2026-08-11','2026-08-12'].map(unknownDay);
    const s = computeSummary(reports, 7);
    expect(s.avgStudy).toBeNull();
    expect(typeof s.overallScore, 'still a number, still counts study as 0 — REPORTED, not fixed').toBe('number');
  });
});
