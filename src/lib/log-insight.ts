// ── The guaranteed log insight: no log ever ends empty-handed ───────────────
//
// Founder, 17 Aug: "students should always get an insight when they log
// something... like minor also — QA syllabus covered x% if some QA topic is
// studied, or just 3 topics remain." The consequence of the log IS the product;
// a log that ends in "saved" teaches the student that logging does nothing.
//
// This module is the FLOOR of the noticed-line ladder in log-daily:
//   milestone (rare, 7/15/30)  >  prescriptive line (behavioral noticing,
//   fires only on real patterns)  >  THIS (always computable from coverage).
//
// Rules, same law as Peer Pulse and the buddy case: every line is a verifiable
// number from THIS student's own rows — never invented, never a population
// stat, never a judgement. "QA: 12 of 28 topics opened" is a fact the student
// can check against their own Preparation Map; "you're doing great" is not.
//
// ── 0C.3a, 18 Aug — THIS FILE NO LONGER CALCULATES ──────────────────────────
//
// It is a CONSUMER of the Fact Registry, the first one. Every number below
// arrives from `facts/registry.ts`; nothing here counts a row, applies a ladder
// predicate, or divides by anything.
//
// The rungs, the ordering, the tie-breaks, the rest-day branch, the fallback
// chain and every character of copy are unchanged from the pre-migration
// version. `log-insight.parity.test.ts` holds that version frozen and runs both
// over ~30,000 fixture cells to prove it.
//
// ONE semantic change, ruled by the founder on the evidence that parity
// surfaced: the denominator is the canonical syllabus (46 = QA 28 + VARC 9 +
// DILR 9), never `rows.length`. The old file divided by however many
// topic_coverage rows a student happened to have, so a student with 7 QA rows
// was told they had opened "6 of 7 — 86%" of QA when the truth was 6 of 28.
// See docs/0C-3A-MIGRATION-PARITY.md.
//
// Pure function, no I/O — the route fetches, this decides.

import { EXAM_SYLLABUS_TOPICS, isPreparationTrackTopic } from './topics-constants';
import { getFact } from './facts/registry';

/**
 * `topic` is load-bearing, not decoration.
 *
 * The registry is membership-scoped: it can only refuse an out-of-universe row
 * if it can see which topic the row names. Scoping by SECTION — what this file
 * did before 0C.3a — cannot tell a QA row naming a VARC topic from a legitimate
 * one, and cannot tell a retired topic from a live one. Unknown evidence must
 * become UNKNOWN, not quietly count.
 */
export interface CoverageRow {
  topic: string;
  section: string;
  status: string;
}

export interface LogInsightInput {
  /** All topic_coverage rows for the student. */
  coverage: CoverageRow[];
  /** Sections in today's log (VARC/DILR/QA/Mock/Revision). */
  todaySections: string[];
  /** True for an honest rest / didn't-study log (0 hours, no sections). */
  isRest: boolean;
  /** Every CareerRai day this student has logged, including today's. Dates, not rows. */
  logDates: string[];
  /** The canonical CareerRai day, from getLogDateString(). Never constructed here. */
  today: string;
}

// The syllabus sections. MOCKS/READING rows in topic_coverage are habit
// tracks, not syllabus — a "% of syllabus" claim must never count them.
const CORE_SECTIONS = ['VARC', 'DILR', 'QA'] as const;

interface SectionFacts {
  section: string;
  opened: number;
  untouched: number;
  atDepth: number;
  pct: number;
  /** The section's canonical size, by construction: opened + untouched. */
  total: number;
}

/**
 * Ask the registry for one section, or null if it has nothing to say.
 *
 * UNKNOWN maps to null, which the rungs treat exactly as the pre-migration
 * `.filter((t) => t.total > 0)` treated a section with no rows: skip it. A
 * declined fact and an absent section produce the same silence — the one case
 * where UNKNOWN and "nothing to report" are legitimately the same outcome,
 * because both end in the line not being said.
 */
function sectionFacts(coverage: CoverageRow[], section: string): SectionFacts | null {
  const opened = getFact('section_opened_units').produce({ coverage, section });
  const untouched = getFact('section_untouched_units').produce({ coverage, section });
  const atDepth = getFact('section_at_depth_units').produce({ coverage, section });
  const pct = getFact('section_opened_pct').produce({ coverage, section });
  if (!opened.known || !untouched.known || !atDepth.known || !pct.known) return null;
  return {
    section,
    opened: opened.value,
    untouched: untouched.value,
    atDepth: atDepth.value,
    pct: pct.value,
    total: opened.value + untouched.value,
  };
}

/**
 * One true sentence about what today's log means against the syllabus.
 * Returns null only when there is genuinely nothing to say (no coverage rows
 * at all AND no logging history) — the route treats null as "omit the line",
 * which for any real student should effectively never happen.
 */
export function coverageInsight(input: LogInsightInput): string | null {
  const { todaySections, isRest, logDates, today } = input;

  // Set aside the OTHER universe — and only that one.
  //
  // `topic_coverage` holds two: the 46 exam units and the 7 habit tracks
  // (MOCKS/READING). A habit row is not bad evidence, it is evidence about a
  // different question, so a syllabus fact may legitimately not see it.
  //
  // Everything else stays in, INCLUDING a topic we do not recognise at all.
  // That row is not "not syllabus" — it is unknown, and the difference is the
  // whole point: dropping it here would quietly move a denominator, while
  // passing it through makes checkUniverse refuse the fact and the line falls
  // silent. Unknown evidence must fail closed, never be filtered away.
  //
  // The first draft of this migration filtered on isExamSyllabusTopic and
  // swallowed unrecognised rows. The parity test below caught it.
  const coverage = input.coverage.filter((r) => !isPreparationTrackTopic(r.topic));

  const last7 = getFact('logged_days_last_7').produce({ logDates, today });
  const totalDays = getFact('logged_days_total').produce({ logDates });
  const loggedDaysLast7 = last7.known ? last7.value : 0;
  const loggedDayCount = totalDays.known ? totalDays.value : 0;

  // Rest / didn't-study day: the honest fact is the showing-up, not the
  // syllabus. Never guilt (the what-the-hell effect is real); just the count.
  if (isRest || todaySections.length === 0) {
    if (loggedDaysLast7 > 1) {
      return `Rest day counted — ${loggedDaysLast7} of the last 7 days showed up. That consistency is the prep.`;
    }
    return loggedDayCount > 1
      ? `Day counted — that's ${loggedDayCount} logged days of your preparation on record.`
      : null; // first-ever log has its own dedicated line in the route
  }

  const studiedCore = CORE_SECTIONS.filter((s) => todaySections.includes(s));

  if (studiedCore.length > 0) {
    const tallies = studiedCore
      .map((s) => sectionFacts(coverage, s))
      .filter((t): t is SectionFacts => t !== null);

    if (tallies.length > 0) {
      // Rung 1 — a studied section is within sight of fully opened. The most
      // motivating true number that exists; always leads when available.
      const nearDone = tallies
        .filter((t) => t.untouched >= 1 && t.untouched <= 3)
        .sort((a, b) => a.untouched - b.untouched)[0];
      if (nearDone) {
        return `Just ${nearDone.untouched} ${nearDone.section} topic${nearDone.untouched === 1 ? '' : 's'} left untouched — the whole section is in sight.`;
      }

      // Rung 2 — a studied section has nothing untouched: the claim moves
      // from breadth to depth, honestly.
      const cleared = tallies.find((t) => t.untouched === 0 && t.opened > 0);
      if (cleared) {
        return cleared.atDepth > 0
          ? `Every ${cleared.section} topic is opened, and ${cleared.atDepth} ${cleared.atDepth === 1 ? 'is' : 'are'} already at revision depth.`
          : `Every ${cleared.section} topic is opened — nothing untouched. Now it's depth, not coverage.`;
      }

      // Rung 3 — the default: the studied section's real opened count. Pick
      // the strongest number of the sections touched today (it is still
      // true, and the best true number is the one worth saying out loud).
      //
      // The sort key is the UNROUNDED ratio, exactly as before the migration.
      // Sorting on section_opened_pct would reorder sections the old code did
      // not tie — 4/9 and 5/9 round apart, but two sections that round together
      // would swap. Selection order is a rule, not a claim, so it is not
      // rounded; the number the student SEES is the fact's rounding.
      const best = tallies
        .filter((t) => t.opened > 0)
        .sort((a, b) => b.opened / b.total - a.opened / a.total)[0];
      if (best) {
        return `${best.section}: ${best.opened} of ${best.total} topics opened — ${best.pct}% of the section on the board.`;
      }

      // Studied a core section but every topic still reads not_started (log
      // preceded any coverage advance): count the day, promise the number.
      return `Counted. As ${tallies[0].section} topics start moving, this line will carry your section numbers.`;
    }
  }

  // Mock/Revision-only day (no core section named): the whole-syllabus fact.
  const wholeOpened = getFact('syllabus_opened_units').produce({ coverage });
  const wholePct = getFact('syllabus_opened_pct').produce({ coverage });
  if (wholeOpened.known && wholePct.known && wholeOpened.value > 0) {
    return `Across the syllabus: ${wholeOpened.value} of ${EXAM_SYLLABUS_TOPICS.length} topics opened (${wholePct.value}%).`;
  }

  // No coverage rows at all — fall back to the one number every log creates.
  return loggedDayCount > 1
    ? `Day counted — that's ${loggedDayCount} logged days of your preparation on record.`
    : null;
}
