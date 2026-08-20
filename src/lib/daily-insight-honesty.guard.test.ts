import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { insightKey, INSIGHT_SUPPRESS_DAYS, type DailyInsight } from './daily-insight';

// ── An insight may claim no more than its evidence ─────────────────────────
//
// 20 Aug 2026. A student's home screen said:
//
//   "Quadratic Equations — top marks in QA, still untouched."
//
// "top marks in QA" was not a fact. It was TOPIC_METADATA.weightage — an
// internal 1–5 emphasis rating a human typed into our own curriculum file —
// rendered to a student as a claim about CAT marks. It had no source, no
// year, no receipt, and Quadratics is rated 4 there, not even 5. This is the
// same failure this codebase keeps paying for (absence of evidence rendered
// as a confident number), this time in the copy layer rather than the data
// layer.
//
// The contract now: student facts may be stated plainly (they are the
// student's own rows). Exam context may be QUALITATIVE and family-level
// only. Numbers about the EXAM belong to a governed historical-fact
// registry that does not exist yet — so until it does, this card carries no
// exam numbers at all.

const SRC = 'src/lib/daily-insight.ts';
const src = () => readFileSync(SRC, 'utf8');

/** The rendered sentences only — comments explain the ban and would trip it. */
function templates(): string[] {
  return [...src().matchAll(/text:\s*oneLine\(([\s\S]*?)\),\n/g)].map((m) => m[1]);
}

describe('the insight never claims marks it cannot evidence', () => {
  it('the exact sentence that caused this is gone', () => {
    expect(src()).not.toContain('top marks in');
  });

  it('no rendered sentence makes a marks / weightage / prediction claim', () => {
    const BANNED = [
      /top marks/i,
      /highest[- ]?(weightage|scoring|marks)/i,
      /most important topic/i,
      /\bexpect\s+\d/i,
      /\bwill (come|appear|be asked)\b/i,
      /guaranteed/i,
      /\bscoring area\b/i,
    ];
    for (const t of templates()) {
      for (const rx of BANNED) {
        expect(rx.test(t), `a rendered insight matches banned claim ${rx}: ${t.slice(0, 90)}`).toBe(false);
      }
    }
  });

  it('carries no exam statistic — no percentages, no question counts', () => {
    // Every number a student reads here must come from their OWN rows
    // (days logged, tasks done, topics left). An exam number would need the
    // historical-fact registry, which does not exist yet.
    for (const t of templates()) {
      expect(/%/.test(t), `an insight shows a percentage: ${t.slice(0, 90)}`).toBe(false);
      expect(/\d+\s*(questions?|marks)\b/i.test(t), `an insight quotes exam volume: ${t.slice(0, 90)}`).toBe(false);
    }
  });

  it('weightage ranks candidates but is never rendered', () => {
    // It may appear in .filter()/.sort() — it must not reach a template.
    expect(src()).toContain('weightage'); // still ranking
    for (const t of templates()) {
      expect(t).not.toContain('weightage');
    }
  });

  it('exam context stays qualitative and family-level', () => {
    const s = src();
    expect(s).toContain('examContextLine');
    // Derived from QA_GROUPS (Algebra/Arithmetic/…), not from a typed string.
    expect(s).toContain('QA_GROUPS.find');
  });
});

describe('the same insight cannot nag every morning', () => {
  it('suppresses a repeat for a week', () => {
    expect(INSIGHT_SUPPRESS_DAYS).toBe(7);
  });

  it('identity is rule + subject, so two different gaps can both be shown', () => {
    const a = { kind: 'high_weightage', subject: 'Quadratic Equations' } as DailyInsight;
    const b = { kind: 'high_weightage', subject: 'Inequalities' } as DailyInsight;
    expect(insightKey(a)).not.toBe(insightKey(b));
    expect(insightKey(a)).toBe('high_weightage:Quadratic Equations');
  });

  it('the fallback is exempt — a quiet week still gets its line', () => {
    // 'progress' is not an observation; suppressing it would blank the card.
    expect(src()).toMatch(/kind !== 'progress' && suppressed\.has/);
  });

  it('both surfaces consult and record through the shared authority', () => {
    for (const f of ['src/app/student/tracker/page.tsx', 'src/app/api/cron/daily-insight/route.ts']) {
      const s = readFileSync(f, 'utf8');
      expect(s, `${f} must consult the memory`).toContain('loadSuppressedInsightKeys');
      expect(s, `${f} must record the show`).toContain('recordInsightShown');
    }
  });

  it('only a DELIVERED push counts as shown', () => {
    // A budget-skipped notification must not silence tomorrow's home card.
    const cron = readFileSync('src/app/api/cron/daily-insight/route.ts', 'utf8');
    expect(cron).toMatch(/outcome === 'sent'[\s\S]{0,200}recordInsightShown/);
  });

  it('the suppression table is declared in a migration, not assumed', () => {
    const sql = readFileSync('supabase/migrations/20260820d_daily_insight_memory.sql', 'utf8');
    expect(sql).toContain('daily_insight_shown');
    expect(sql).toContain('enable row level security');
  });
});
