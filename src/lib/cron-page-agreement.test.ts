import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  recommendFor, buildMatchStudent, rankBuddies, matchReason,
  type FocusInputs, type MatchBuddy,
} from '@/lib/buddy-match';

// ── The push may never name a mentor the page will not recommend ───────────
//
// P1, found by the 48-hour audit and proven against production. The page
// resolved focus through resolveFocusSections; cron/buddy-evening called
// rankBuddies directly with only the baseline columns, which are populated for
// ONE of 553 students -- so the cron ranked on profile completeness alone.
//
// Measured consequence before the fix: the completeness winner is Soumitra
// (QA), while a DILR-focused student's page recommends Spandana (DILR). 80 of
// 123 push-eligible students resolve to DILR. The cron's own comment claimed
// "the push never tells a different story from the page it opens" -- and it
// had stopped being true.
//
// The defect was never the cron's column list. It was that TWO code paths
// could each decide what a student's problem is. So this guard pins the
// STRUCTURE, not the strings: there is one producer, and the cron reaches a
// recommendation only through it.

const ROOT = process.cwd();
const code = (p: string) =>
  readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const CRON = 'src/app/api/cron/buddy-evening/route.ts';

const buddy = (o: Partial<MatchBuddy>): MatchBuddy => ({
  id: 'b', full_name: 'B', avatar_url: null, cat_percentile: 98,
  first_attempt_percentile: null, cat_year: 2025, iim_converted: null,
  current_company: null, strongest_section: null, student_types_helped: null,
  how_i_work: null, linkedin_url: null, ...o,
});
const inputs = (o: Partial<FocusInputs>): FocusInputs => ({
  profile: {}, coverage: [], debriefs: [], routines: [], completions: [], ...o,
});

/** The exact roster shape production has: QA-heavy, one strong DILR, no VARC. */
const ROSTER: MatchBuddy[] = [
  buddy({ id: 'soumitra', strongest_section: 'QA', avatar_url: 'a', linkedin_url: 'l', iim_converted: 'IIM I', how_i_work: 'w', cat_percentile: 98.6 }),
  buddy({ id: 'spandana', strongest_section: 'DILR', avatar_url: 'a', linkedin_url: 'l', iim_converted: 'IIM R', cat_percentile: 98 }),
  buddy({ id: 'shreya', strongest_section: 'QA', cat_percentile: 99.5 }),
];

describe('cron and page cannot disagree', () => {
  it('the cron reaches a recommendation only through the shared producer', () => {
    const s = code(CRON);
    expect(s, 'cron must call the same producer the page calls').toMatch(/recommendFor\(/);
    expect(s, 'cron must not rank independently').not.toMatch(/rankBuddies\(/);
    expect(s, 'cron must not build its own reason').not.toMatch(/matchReason\(/);
  });

  it('the cron does not re-declare the buddy eligibility column list', () => {
    // A second copy of the column list is how the two sides drift apart again.
    const s = code(CRON);
    expect(s).toMatch(/fetchEligibleBuddies\(/);
    expect(s, 'eligibility is defined once, in buddy-match').not.toMatch(/first_attempt_percentile, cat_year/);
  });

  it('the cron fetches focus inputs — it cannot fall back to baselines', () => {
    const s = code(CRON);
    expect(s).toMatch(/fetchFocusInputsBulk\(/);
    // The old select carried the baseline columns; their absence is the proof
    // the legacy completeness path is unreachable from here.
    expect(s).not.toMatch(/baseline_varc/);
  });

  it('same student + same roster ⇒ same #1 on both paths', () => {
    // recommendFor IS both paths now, so this asserts determinism of the thing
    // they share rather than comparing two implementations.
    const dilr = inputs({ profile: { self_reported_weakest_section: 'DILR' } });
    const page = recommendFor(dilr, ROSTER, '2026-08-20');
    const cron = recommendFor(dilr, ROSTER, '2026-08-20');
    expect(page[0].id).toBe(cron[0].id);
    expect(page[0].reason).toBe(cron[0].reason);
  });

  it('a DILR-focused student gets the DILR mentor, not the completeness winner', () => {
    // The exact production divergence, now impossible.
    const dilr = inputs({ profile: { self_reported_weakest_section: 'DILR' } });
    expect(recommendFor(dilr, ROSTER, '2026-08-20')[0].id).toBe('spandana');
  });

  it('a QA-focused student still gets the QA mentor', () => {
    const qa = inputs({ profile: { self_reported_weakest_section: 'QA' } });
    expect(recommendFor(qa, ROSTER, '2026-08-20')[0].id).toBe('soumitra');
  });

  it('VARC with no VARC mentor falls back honestly, with no personalised claim', () => {
    const varc = inputs({ profile: { self_reported_weakest_section: 'VARC' } });
    const out = recommendFor(varc, ROSTER, '2026-08-20');
    expect(out[0].id).toBe('soumitra');          // completeness tie-break
    expect(out[0].reason).toBeNull();            // but no "matched to you" claim
  });

  it('no student receives a duplicate mentor in the five', () => {
    const out = recommendFor(inputs({ profile: { self_reported_weakest_section: 'QA' } }), ROSTER, '2026-08-20');
    expect(new Set(out.map((b) => b.id)).size).toBe(out.length);
  });

  it('the bulk fetch is chunked, not one round-trip per student', () => {
    const s = code('src/lib/buddy-match.ts');
    expect(s, 'chunking is what keeps 100k students survivable').toMatch(/FOCUS_BULK_CHUNK/);
    expect(s).toMatch(/\.in\('id', ids\)/);
    expect(s).toMatch(/\.in\('student_id', ids\)/);
  });

  it('buildMatchStudent is pure — it takes rows, never a database client', () => {
    const s = code('src/lib/buddy-match.ts');
    const fn = s.slice(s.indexOf('export function buildMatchStudent'), s.indexOf('export const FOCUS_PROFILE_COLUMNS'));
    expect(fn, 'a resolver that can fetch is a resolver that can diverge').not.toMatch(/admin|supabase|\.from\(/);
  });

  it('a plateau still outranks a self-report on BOTH paths', () => {
    const withPlateau = buildMatchStudent(inputs({
      profile: { self_reported_weakest_section: 'QA' },
      routines: [{ tasks: [{ id: 't1', topic: 'Arithmetic', section: 'DILR' }] }],
      completions: [
        { routine_date: '2026-08-15', task_id: 't1', confidence: 'red' },
        { routine_date: '2026-08-17', task_id: 't1', confidence: 'red' },
        { routine_date: '2026-08-19', task_id: 't1', confidence: 'red' },
      ],
    }), '2026-08-20');
    expect(withPlateau.plateau).toEqual({ topic: 'Arithmetic', section: 'DILR' });
    expect(rankBuddies(withPlateau, ROSTER)[0].id).toBe('spandana');
    expect(matchReason(withPlateau, ROSTER[1])).toContain('Arithmetic plateau');
  });
});
