import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { computeSummary } from './analytics';
import type { DailyReport } from '@/types';

// ── J2 — RETIRE THE BURNOUT AND SLEEP RED FLAGS ─────────────────────────────
//
// Founder ruling: RETIRE, do not resurrect. These are not dormant features
// waiting for a better threshold — they depend on evidence CareerRai does not
// collect, and one of them was actively misfiring for a different reason.
//
// upsert_log_and_streak hard-codes confidence=4, stress=2, sleep_quality=3 on
// every write (J1, NOT this gate — the RPC is untouched). Burnout
// (avgStress >= 4) has genuinely never fired: 0 notifications, ever, and
// mathematically cannot while stress is pinned at 2.
//
// Sleep is the more important finding of this audit, because the founder's
// premise — "neither has ever fired" — was only half true. `avg([]) === 0`
// when a student has ZERO reports in the trailing window, and `0 < 3` is
// true. ALL 26 production firings of "Sleep quality below 3/5" coincide
// exactly with the "Fewer than 4 reports this week" flag — a student who
// logged nothing was told their SLEEP was the problem. Not a measurement of
// stress-column fabrication; a second, independent defect: absence of
// evidence read as a specific, alarming number. Retiring the rule removes
// both failure modes at once and loses no real signal, because every one of
// those 26 weeks is already correctly flagged as "going quiet".
//
// "Avg study below 3 hrs/day" shares the same avg([])===0 mechanism (46 of
// its 55 firings also coincide with zero-report weeks) but is NOT retired
// here: 9 of 55 are genuine partial-week undershoot, real signal the
// zero-report weeks don't carry. Out of scope for this gate; reported, not
// touched.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p).split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

function reportsOf(n: { stress?: number; sleep_quality?: number; study_duration?: number }[]): DailyReport[] {
  return n.map((r) => ({
    student_id: 's', report_date: '2026-08-18',
    study_duration: r.study_duration ?? 4, confidence: 4, stress: r.stress ?? 2,
    sleep_quality: r.sleep_quality ?? 3, overall_energy: 4, mock_taken: false, total_accuracy: null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any));
}

describe('the burnout rule cannot be registered or executed', () => {
  it('no report shape produces a burnout red flag', () => {
    // Even a maximal stress value (5, never observed in production) must not
    // resurrect the rule — it is retired, not re-thresholded.
    const summary = computeSummary(reportsOf([{ stress: 5 }, { stress: 5 }, { stress: 5 }]), 7);
    expect(summary.redFlags.some((f) => f.toLowerCase().includes('burnout'))).toBe(false);
    expect(summary.redFlags.some((f) => f.toLowerCase().includes('stress'))).toBe(false);
  });

  it('the source contains no burnout rule', () => {
    expect(code('src/lib/analytics.ts')).not.toMatch(/avgStress\s*>=\s*4/);
    expect(code('src/lib/analytics.ts').toLowerCase()).not.toContain('burnout');
  });
});

describe('the sleep rule cannot be registered or executed', () => {
  it('no report shape produces a sleep red flag', () => {
    const summary = computeSummary(reportsOf([{ sleep_quality: 1 }, { sleep_quality: 1 }, { sleep_quality: 1 }, { sleep_quality: 1 }]), 7);
    expect(summary.redFlags.some((f) => f.toLowerCase().includes('sleep'))).toBe(false);
  });

  it('a zero-report week no longer fires a sleep flag from avg([]) === 0', () => {
    // The defect this gate actually fixes: absence of evidence must not read
    // as "sleep quality of 0/5". The "going quiet" flag alone still covers
    // this week honestly.
    const summary = computeSummary(reportsOf([]), 7);
    expect(summary.redFlags.some((f) => f.toLowerCase().includes('sleep'))).toBe(false);
    expect(summary.redFlags.some((f) => f.toLowerCase().includes('quiet'))).toBe(true);
  });

  it('the source contains no sleep rule', () => {
    expect(code('src/lib/analytics.ts')).not.toMatch(/avgSleep\s*<\s*3/);
    expect(code('src/lib/analytics.ts').toLowerCase()).not.toMatch(/sleep quality below/);
  });
});

describe('no replacement threshold or fallback wellbeing rule was introduced', () => {
  it('redFlags gains no new entry to replace the retired two', () => {
    const src = code('src/lib/analytics.ts');
    const pushes = (src.match(/redFlags\.push/g) ?? []).length;
    // 3 remain: momentum (study<3), going-quiet (reports<4), mock declining.
    expect(pushes).toBe(3);
  });

  it('no synthetic wellbeing value (UNKNOWN, 0, 2, 3) stands in for the retired claims', () => {
    const src = code('src/lib/analytics.ts');
    expect(src).not.toMatch(/wellbeing.*unknown/i);
    expect(src).not.toMatch(/stress.*fallback/i);
  });
});

describe('the three remaining red flags are unchanged', () => {
  it('momentum still fires below 3 avg hours', () => {
    const summary = computeSummary(reportsOf([{ study_duration: 1 }, { study_duration: 1 }, { study_duration: 1 }, { study_duration: 1 }]), 7);
    expect(summary.redFlags).toContain('Avg study below 3 hrs/day — momentum dropping');
  });

  it('going-quiet still fires under 4 reports in a 7-day period', () => {
    const summary = computeSummary(reportsOf([{}, {}]), 7);
    expect(summary.redFlags).toContain('Fewer than 4 reports this week — going quiet');
  });

  it('mock decline is untouched — still reachable, still independent', () => {
    const src = code('src/lib/analytics.ts');
    expect(src).toContain('Mock accuracy declining');
  });
});

describe('shared infrastructure is preserved — retirement is deletion of the RULE, not the pipeline', () => {
  it('check-red-flags still exists and still generically forwards whatever fires', () => {
    const src = code('src/app/api/cron/check-red-flags/route.ts');
    expect(src).toContain('summary.redFlags');
    expect(src).toContain('sendRedFlagAlert');
    // `sleep_quality` legitimately stays in the select — computeSummary still
    // needs the full report shape for moodScore. Generic — no per-flag
    // branching or rule TEXT to remove from this file at all.
    expect(src.toLowerCase()).not.toContain('burnout');
    expect(src.toLowerCase()).not.toMatch(/sleep quality below/);
  });

  it('sendRedFlagAlert is untouched — it renders whatever array it is given', () => {
    expect(code('src/lib/email.ts')).toContain('flags.map');
  });

  it('avgStress and avgSleep remain computed — moodScore needs them, out of scope for J2', () => {
    const src = code('src/lib/analytics.ts');
    expect(src).toContain('const avgStress');
    expect(src).toContain('const avgSleep');
    expect(src).toContain('moodScore');
  });

  it('the RPC fabricated-constants writer is untouched — J1 is a separate gate', () => {
    const rpc = read('supabase/migrations/20260812_log_daily_hours_accept_decimals.sql');
    expect(rpc, 'J1 is not this gate').toContain('confidence = 4, stress = 2');
  });
});

describe('the product gap is recorded, not silently closed', () => {
  it('the retirement is documented as an honest gap, not a solved capability', () => {
    const src = read('docs/ENGINEERING-MEMORY-ARCHIVE.md');
    expect(src.toLowerCase()).toContain('no trustworthy');
    expect(src).toMatch(/burnout/i);
  });
});
