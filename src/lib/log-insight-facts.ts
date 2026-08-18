// ── 0C.3a — log-insight, rebuilt on the Fact Registry ───────────────────────
//
// The FIRST consumer migration. It is deliberately a parallel implementation,
// not an edit of `log-insight.ts`, because the migration contract (founder,
// 18 Aug) is byte-identical parity:
//
//   "Old implementation and registry implementation run side-by-side in tests.
//    If old !== new — STOP. Do not 'improve' the output during migration."
//
// Every rung, every tie-break, every character of copy is copied across
// unchanged. ONLY THE COUNTING MOVES. What changes is where the numbers come
// from: `log-insight.ts` counts rows inline, this asks the registry.
//
// See `log-insight.parity.test.ts` for what that comparison actually found,
// and docs/0C-3A-MIGRATION-PARITY.md for the two rulings it needs.

import { EXAM_SYLLABUS_TOPICS, isExamSyllabusTopic } from './topics-constants';
import { getFact } from './facts/registry';

/**
 * One more column than the old shape: `topic`.
 *
 * The registry is membership-scoped — it can only refuse an out-of-universe
 * row if it can see which topic the row names. `log-insight.ts` scoped by
 * SECTION instead, which cannot tell a QA row naming a VARC topic from a
 * legitimate one. The route's select gains `topic` when this ships.
 */
export interface FactCoverageRow { topic: string; section: string; status: string }

export interface LogInsightFactsInput {
  coverage: FactCoverageRow[];
  todaySections: string[];
  isRest: boolean;
  /** Every CareerRai day this student has logged. Dates, not a row count. */
  logDates: string[];
  /** The canonical CareerRai day, from getLogDateString(). Never constructed here. */
  today: string;
}

const CORE_SECTIONS = ['VARC', 'DILR', 'QA'] as const;

interface SectionFacts {
  section: string;
  opened: number;
  untouched: number;
  atDepth: number;
  /** opened + untouched — the section's membership universe, by construction. */
  total: number;
}

/**
 * Ask the registry for one section, or null if it has nothing to say.
 *
 * UNKNOWN maps to null, which the rungs below treat exactly as the old
 * `.filter((t) => t.total > 0)` treated a section with no rows: skip it. A
 * declined fact and an absent section produce the same silence — the one case
 * where UNKNOWN and "nothing here" are legitimately the same outcome.
 */
function sectionFacts(coverage: FactCoverageRow[], section: string): SectionFacts | null {
  const opened = getFact('section_opened_units').produce({ coverage, section });
  const untouched = getFact('section_untouched_units').produce({ coverage, section });
  const atDepth = getFact('section_at_depth_units').produce({ coverage, section });
  if (!opened.known || !untouched.known || !atDepth.known) return null;
  return {
    section,
    opened: opened.value,
    untouched: untouched.value,
    atDepth: atDepth.value,
    total: opened.value + untouched.value,
  };
}

export function coverageInsightFromFacts(input: LogInsightFactsInput): string | null {
  const { todaySections, isRest, logDates, today } = input;

  // Scope to the exam syllabus BEFORE asking an exam-syllabus fact.
  //
  // `topic_coverage` holds two universes in one table: the 46 exam units and
  // the 7 habit tracks (MOCKS/READING/General). A row from the second is not
  // bad evidence — it is evidence about a different question, and the registry
  // rightly returns UNKNOWN if it sees one. Narrowing to the universe the
  // question is about is scoping; dropping a row the question DOES cover would
  // be laundering. The predicate is the canonical one, so a topic added to an
  // exam section is picked up here without an edit.
  const coverage = input.coverage.filter((r) => isExamSyllabusTopic(r.topic));

  const last7 = getFact('logged_days_last_7').produce({ logDates, today });
  const total = getFact('logged_days_total').produce({ logDates });
  const loggedDaysLast7 = last7.known ? last7.value : 0;
  const loggedDayCount = total.known ? total.value : 0;

  if (isRest || todaySections.length === 0) {
    if (loggedDaysLast7 > 1) {
      return `Rest day counted — ${loggedDaysLast7} of the last 7 days showed up. That consistency is the prep.`;
    }
    return loggedDayCount > 1
      ? `Day counted — that's ${loggedDayCount} logged days of your preparation on record.`
      : null;
  }

  const studiedCore = CORE_SECTIONS.filter((s) => todaySections.includes(s));

  if (studiedCore.length > 0) {
    const tallies = studiedCore
      .map((s) => sectionFacts(coverage, s))
      .filter((t): t is SectionFacts => t !== null);

    if (tallies.length > 0) {
      const nearDone = tallies
        .filter((t) => t.untouched >= 1 && t.untouched <= 3)
        .sort((a, b) => a.untouched - b.untouched)[0];
      if (nearDone) {
        return `Just ${nearDone.untouched} ${nearDone.section} topic${nearDone.untouched === 1 ? '' : 's'} left untouched — the whole section is in sight.`;
      }

      const cleared = tallies.find((t) => t.untouched === 0 && t.opened > 0);
      if (cleared) {
        return cleared.atDepth > 0
          ? `Every ${cleared.section} topic is opened, and ${cleared.atDepth} ${cleared.atDepth === 1 ? 'is' : 'are'} already at revision depth.`
          : `Every ${cleared.section} topic is opened — nothing untouched. Now it's depth, not coverage.`;
      }

      // The sort key is the UNROUNDED ratio, exactly as before. Sorting on the
      // rounded percentage would reorder ties the old code did not tie —
      // 4/9 (44.4 → 44) and 14/28 (50.0 → 50) round apart, but two sections
      // that round together would swap. Selection order is not a claim, so it
      // is not rounded.
      const best = tallies
        .filter((t) => t.opened > 0)
        .sort((a, b) => b.opened / b.total - a.opened / a.total)[0];
      if (best) {
        // ⚠ BLOCKED — this ratio has no registered fact.
        //
        // `section_opened_pct` was not among the five facts approved for Gate
        // 3, because my 0C.3 investigation enumerated the COUNTS this line
        // needs and missed the PERCENTAGE it prints. Computing it here is a
        // ratio produced outside the registry with no declared numerator,
        // denominator or range — precisely what Constitution Article 5 forbids.
        // It is written this way so parity can be MEASURED, not so it can ship.
        const pct = Math.round((best.opened / best.total) * 100);
        return `${best.section}: ${best.opened} of ${best.total} topics opened — ${pct}% of the section on the board.`;
      }

      return `Counted. As ${tallies[0].section} topics start moving, this line will carry your section numbers.`;
    }
  }

  const wholeOpened = getFact('syllabus_opened_units').produce({ coverage });
  if (wholeOpened.known && wholeOpened.value > 0) {
    // ⚠ BLOCKED — same gap, whole-syllabus scale. Needs `syllabus_opened_pct`.
    const wholeTotal = EXAM_SYLLABUS_TOPICS.length;
    const pct = Math.round((wholeOpened.value / wholeTotal) * 100);
    return `Across the syllabus: ${wholeOpened.value} of ${wholeTotal} topics opened (${pct}%).`;
  }

  return loggedDayCount > 1
    ? `Day counted — that's ${loggedDayCount} logged days of your preparation on record.`
    : null;
}
