import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── G2 (0C.3G / J7 + J8) ─────────────────────────────────────────────────────
//
// The Daily Evidence Contract (docs/0C-3G-DAILY-EVIDENCE-CONTRACT.md, `8caae5d`):
// J7 — topics_covered holds exactly one vocabulary (sections). J8 — a later
// write may never shrink what a prior write already established.
//
// FRESH SWEEP FINDING (not assumed from the prior audits' lists): tracing
// every WRITER first, rather than trusting the 11-reader classification,
// found J7 is ALREADY TRUE of both live writers. log-daily/route.ts:68
// validates `body.sections` against VALID_SECTIONS before ever reaching the
// RPC; complete-task/route.ts:210 filters `routineSections` the same way.
// Both import the correct 5-item VALID_SECTIONS from streak-utils.ts (not the
// unrelated, differently-scoped VALID_SECTIONS in coverage-validate.ts, which
// governs topic_coverage, a different table with a different universe — a
// distinct set worth naming precisely, since two same-named exports in one
// codebase is exactly the class of drift this project has repeatedly found).
//
// So the 46 historical topic-vocabulary rows (2 non-real accounts, unchanged,
// unbackfilled) came from a THIRD path — the demo seed migration
// (20260621_refresh_demo_dates.sql), a one-off SQL script that bypasses
// application validation entirely, not a live writer. Nothing in application
// code needs to change for J7; this file PROVES that instead of assuming it,
// so a future edit to either writer's validation cannot silently regress it.
//
// J8 is the real, single violation this gate fixes: log-daily's RPC call
// still passes `body.sections` — the CURRENT payload alone — as
// `p_topics_covered`, an unconditional replace at the SQL level
// (`topics_covered = p_topics_covered`, migration :73, untouched by this
// gate). complete-task already does the correct thing
// (`[...new Set([...existing, ...routineSections])]`) before calling the
// SAME RPC. The fix makes log-daily do what complete-task already does —
// not new logic, the existing correct pattern extended to the other caller.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const code = (p: string) => read(p).split('\n')
  .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('J7 — both live writers already constrain the vocabulary (confirmed, not implemented)', () => {
  it('log-daily validates body.sections against the correct VALID_SECTIONS before any write', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    expect(src).toContain("from '@/lib/streak-utils'");
    expect(src).toMatch(/body\.sections\.every\(\(s\) => \(VALID_SECTIONS as readonly string\[\]\)\.includes\(s\)\)/);
  });

  it('complete-task filters routineSections against the same VALID_SECTIONS', () => {
    const src = code('src/app/api/routine/complete-task/route.ts');
    expect(src).toContain("import { getLogDateString, VALID_SECTIONS } from '@/lib/streak-utils'");
    expect(src).toMatch(/\.filter\(\(s\): s is string => \(VALID_SECTIONS as readonly string\[\]\)\.includes\(s\)\)/);
  });

  it('the two VALID_SECTIONS exports are genuinely different sets for different tables — named, not conflated', () => {
    const streakUtils = code('src/lib/streak-utils.ts');
    const coverageValidate = code('src/lib/coverage-validate.ts');
    expect(streakUtils).toContain("['VARC', 'DILR', 'QA', 'Mock', 'Revision']");
    // coverage-validate's export governs topic_coverage's universe, not
    // topics_covered's — asserting they are NOT the same array literal is
    // the point: a future "simplification" merging them would silently widen
    // or narrow one table's vocabulary using the other's rule.
    expect(coverageValidate).not.toContain("['VARC', 'DILR', 'QA', 'Mock', 'Revision']");
  });

  it('the 46 historical topic-vocabulary rows are attributable to the demo seed, not a live writer', () => {
    const seed = read('supabase/migrations/20260621_refresh_demo_dates.sql');
    expect(seed).toContain('topics_covered');
    // Confirms the seed writes RAW SQL, outside VALID_SECTIONS validation —
    // the third path, not touched or backfilled by this gate.
    expect(seed).not.toContain('VALID_SECTIONS');
  });
});

describe('J8 — log-daily no longer shrinks topics_covered on a resubmission', () => {
  it('the RPC call unions with the existing row, not the current payload alone', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    expect(src, 'p_topics_covered must not be the bare current-request array')
      .not.toMatch(/p_topics_covered:\s*body\.sections,/);
    expect(src).toMatch(/p_topics_covered:\s*mergedSections,/);
  });

  it('the merge is a real union — existing plus incoming, deduplicated — mirroring complete-task exactly', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    expect(src).toMatch(/const mergedSections = \[\.\.\.new Set\(\[\.\.\.\(existingLog\?\.topics_covered \?\? \[\]\), \.\.\.body\.sections\]\)\];/);
  });

  it('no new query was added — the merge reuses the existing P0-1 fetch', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    // Two selects already name topics_covered before this gate: the P0-1
    // existingLog fetch (line ~106) and computePrescriptiveLine's unrelated
    // pre-existing 14-day read for the avoidance rule. This gate's merge must
    // reuse the FIRST one, not add a third select anywhere in the file.
    const selectCalls = src.match(/\.select\('[^']*'\)/g) ?? [];
    const selectsNamingTopicsCovered = selectCalls.filter((c) => c.includes('topics_covered'));
    expect(selectsNamingTopicsCovered.length, 'no third select naming topics_covered').toBe(2);
  });

  it('scope containment — study_duration, mock_taken and every other field keep their existing write semantics', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    expect(src).toMatch(/p_study_duration:\s*body\.hours,/);
    expect(src).toMatch(/p_mock_taken:\s*body\.sections\.includes\('Mock'\),/);
  });

  it('complete-task\'s own merge pattern is untouched — this gate extends it, does not redefine it', () => {
    const src = code('src/app/api/routine/complete-task/route.ts');
    expect(src).toMatch(/const mergedSections = \[\.\.\.new Set\(\[\.\.\.\(existingLog\?\.topics_covered \?\? \[\]\), \.\.\.routineSections\]\)\];/);
  });

  it('the RPC migration is untouched — the union happens in application code, not the stored procedure', () => {
    const rpc = read('supabase/migrations/20260812_log_daily_hours_accept_decimals.sql');
    expect(rpc).toContain('topics_covered    = p_topics_covered');
  });
});

describe('no reader depends on the malformed historical vocabulary', () => {
  // Every reader of topics_covered treats entries as opaque strings — none
  // assumes exactly 5 items, none breaks if the array is a superset going
  // forward. Fresh-checked, not trusted from the prior audit's list.
  for (const [file, pattern] of [
    ['src/lib/buddy-briefing.ts', /flatMap\(\(r\) => \(r\.topics_covered/],
    ['src/lib/mentor-doors.ts', /topics_covered/],
    ['src/lib/os/peer-cohort-data.ts', /topics_covered/],
  ] as const) {
    it(`${file} reads topics_covered without assuming a fixed vocabulary`, () => {
      expect(code(file)).toMatch(pattern);
    });
  }
});

describe('no schema, no migration, no J6/J12 scope creep', () => {
  it('study_duration merge behavior (J6) is untouched by this gate', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    expect(src).not.toMatch(/self_reported_study_duration|credited_study_duration/);
  });

  it('advanceCoverage error handling (J12) is untouched by this gate', () => {
    const src = code('src/app/api/routine/complete-task/route.ts');
    expect(src).toContain("console.error('[complete-task] coverage read failed, skipping advance', readErr.message)");
  });
});
