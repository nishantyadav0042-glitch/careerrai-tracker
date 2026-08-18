import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── J3 — WELLBEING IS NOT PRESENTED AS MEASUREMENT ──────────────────────────
//
// docs/0C-3E-DATA-INTEGRITY-AUDIT.md, step J3: "Stop presenting wellbeing as
// measurement. *avg stress 2/5* → omitted. Every briefed student. Removing a
// fabricated sentence needs no new data."
//
// ROOT CAUSE (audit Part A1, unchanged by this gate): upsert_log_and_streak —
// the sole writer of daily_reports — hard-codes `confidence = 4, stress = 2,
// sleep_quality = 3, overall_energy = 4, quality_focus = 3, difficulty = 3` on
// BOTH its INSERT and UPDATE branches, and takes no parameter for any of them.
// 282 of 320 rows carry that exact signature; `stress` has two distinct values
// in the entire table. Fixing the writer is J1 and is NOT in this gate.
//
// WHY THE VALUES CANNOT BE FILTERED RATHER THAN OMITTED. A gate of the form
// "present it only where provenance is established" cannot be written, because
// a genuine student `2` is byte-identical to the RPC's `2` and `2` is a legal
// answer. Measured: of the rows that differ from the constants, 23 of 24
// stress and 26 of 30 confidence belong to DEMO accounts; real students have
// one stress row and at most four confidence rows, all on 24 Jul — and those
// four are a LOWER BOUND, not a count, since anyone who genuinely chose 4 is
// invisible. Any conditional gate would surface exactly the unprovable values.
// So: omitted, unconditionally.
//
// NOT IN THIS GATE, deliberately: the RPC (J1), the burnout and sleep red
// flags (J2), moodScore's constant 20/25 inside overallScore (a scoring-scale
// decision, not a sentence), and the historical rows (no backfill, ever).

// Comments EXPLAIN the rule — including quoting the fabricated strings this
// gate removes — so only executable lines can break it. Same reason
// registry.guard.test.ts strips comments before scanning for banned patterns.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*'))
    .join('\n');
const read = (p: string) => stripComments(readFileSync(join(process.cwd(), p), 'utf8'));

/** Unstripped, for the two assertions that check a comment is PRESENT. */
const readRaw = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');

describe('the paid mentor brief states no wellbeing average', () => {
  const src = read('src/lib/buddy-briefing.ts');

  it('the LLM facts block no longer asserts confidence or stress', () => {
    // "Avg confidence: 4/5, avg stress: 2/5" went into the prompt a human
    // mentor reads before a paid session. Neither number came from the student.
    expect(src).not.toMatch(/Avg confidence: \$\{avgConfidence\}\/5/);
    expect(src).not.toMatch(/avg stress: \$\{avgStress\}\/5/);
  });

  it('the fallback brief line no longer asserts stress', () => {
    expect(src).not.toMatch(/Avg stress: \$\{avgStress\}\/5/);
  });

  it('computes no wellbeing average it cannot support', () => {
    // Not merely unrendered — not derived at all, so nothing can quietly
    // re-render it later.
    expect(src).not.toContain('avgStress');
    expect(src).not.toContain('avgConfidence');
  });

  it('preserves the rest of the briefing', () => {
    // Streak, days logged, hours, topics, syllabus facts and mocks all stay.
    for (const kept of ['Streak:', 'days logged', 'avg ${avgHours} hrs/day', 'Topics covered', 'Recent mocks']) {
      expect(src, `${kept} must survive`).toContain(kept);
    }
    expect(src).toContain('struggledMarks'); // a real signal, from tick confidence
  });
});

describe('the weekly signal states no stress figure', () => {
  const route = read('src/app/api/weekly-signal/route.ts');
  const card = read('src/components/weekly-signal-card.tsx');

  it('drops the stress branch and the stress clause from the rule-based line', () => {
    expect(route).not.toMatch(/Stress trending up over the week/);
    expect(route).not.toMatch(/stress steady at \$\{s\.avg_stress\}\/5/);
  });

  it('still returns a line for every shape — never blank', () => {
    // The comment above ruleBasedInsight promises "never an error, never
    // blank". Removing a branch must not remove the guarantee.
    const fn = route.slice(route.indexOf('function ruleBasedInsight'), route.indexOf('export async function POST'));
    expect(fn).toContain('return `');
    expect((fn.match(/return `/g) ?? []).length).toBeGreaterThanOrEqual(3);
  });

  it('does not hand the model a stress figure to cite', () => {
    expect(route).not.toContain('avg_stress');
    expect(route).not.toContain('stress_trend');
  });

  it('the buddy card no longer renders a Stress trend tile', () => {
    expect(card).not.toContain('Stress trend');
    expect(card).not.toContain('avgStress');
  });

  it('the card keeps the signals that are real', () => {
    for (const kept of ['Days studied', 'Avg hours/day', 'Mock performance']) {
      expect(card, `${kept} must survive`).toContain(kept);
    }
  });
});

describe('the AI drafts cite no wellbeing figure', () => {
  it('feedback-draft drops the stress clause', () => {
    const src = read('src/app/api/feedback-draft/route.ts');
    expect(src).not.toMatch(/avg stress \$\{avgStress\}\/5/);
    expect(src).not.toContain('avgStress');
    expect(src, 'the hours clause is real evidence and stays').toContain('avg ${avgHours} hrs/day');
  });
});

describe('nothing was invented to replace it', () => {
  it('no surface substitutes a placeholder wellbeing number', () => {
    for (const p of [
      'src/lib/buddy-briefing.ts',
      'src/app/api/weekly-signal/route.ts',
      'src/app/api/feedback-draft/route.ts',
      'src/components/weekly-signal-card.tsx',
    ]) {
      const src = read(p);
      expect(src, `${p} must not invent a stress default`).not.toMatch(/stress[^\n]{0,40}\?\?\s*3/i);
      expect(src, `${p} must not print a /5 wellbeing scale`).not.toMatch(/stress[^\n]{0,30}\/5/i);
    }
  });

  it('the writer and the red flags are untouched — J1 and J2 are separate gates', () => {
    const rpc = readRaw('supabase/migrations/20260812_log_daily_hours_accept_decimals.sql');
    expect(rpc, 'J1 is not this gate').toContain('confidence = 4, stress = 2');
    const analytics = readRaw('src/lib/analytics.ts');
    expect(analytics, 'J2 is not this gate').toContain('burnout risk');
  });
});
