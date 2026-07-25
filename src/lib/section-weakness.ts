import type { Section } from '@/lib/prep-model';

// THE weakest-section rule — the single most load-bearing derivation in the
// plan engine: it decides which section the daily plan front-loads, which
// section the companion notification names, and which section the Home
// insight talks about.
//
// Before the 26 Jul architecture audit this exact function existed three
// times (companion.ts, routine-plan.ts, routine/today/route.ts) — one copy
// even carried a comment apologising for the duplication. Three copies of the
// rule that decides a student's focus is how the cron message says "your
// weakest is DILR" while the plan they open works QA. One rule, one file.
//
// The rule: per section, untouched topics count 2, opened-but-early topics
// count 1, normalised by that section's row count so section size doesn't
// bias it. Ties break DILR → QA → VARC (DILR is where CAT is most often
// lost, so equal gaps resolve toward it). Sections with no rows are skipped —
// callers decide what "no data" means for them.
export function weakestFromCoverage(rows: { section: string; status: string }[]): Section | null {
  if (rows.length === 0) return null;
  const tieOrder: Section[] = ['DILR', 'QA', 'VARC'];
  let best: { s: Section; score: number } | null = null;
  for (const s of tieOrder) {
    const sectionRows = rows.filter((r) => r.section === s);
    if (sectionRows.length === 0) continue;
    const gap = sectionRows.reduce((sum, r) => sum + (r.status === 'not_started' ? 2 : r.status === 'learning' ? 1 : 0), 0);
    const score = gap / sectionRows.length;
    if (best == null || score > best.score) best = { s, score };
  }
  return best?.s ?? null;
}
