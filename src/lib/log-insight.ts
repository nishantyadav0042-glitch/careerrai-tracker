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
// stat, never a judgement. "QA: 12 of 27 topics opened" is a fact the student
// can check against their own Preparation Map; "you're doing great" is not.
//
// Pure function, no I/O — the route fetches, this decides. Testable without a
// database.

import { isOpened, isAtRevisionDepth } from './coverage-status';

export interface CoverageRow {
  section: string;
  status: string;
}

export interface LogInsightInput {
  /** All topic_coverage rows for the student (section + status only). */
  coverage: CoverageRow[];
  /** Sections in today's log (VARC/DILR/QA/Mock/Revision). */
  todaySections: string[];
  /** True for an honest rest / didn't-study log (0 hours, no sections). */
  isRest: boolean;
  /** Total logged days ever, INCLUDING the one just written. */
  loggedDayCount: number;
  /** Distinct days logged in the trailing 7, INCLUDING the one just written. */
  loggedDaysLast7: number;
}

// The syllabus sections. MOCKS/READING rows in topic_coverage are habit
// tracks, not syllabus — a "% of syllabus" claim must never count them.
const CORE_SECTIONS = ['VARC', 'DILR', 'QA'] as const;

// Ladder predicates come from coverage-status.ts — the single authority — and
// are never re-spelled here. Re-listing the statuses is what
// covered-authority.guard.test.ts forbids, and it caught this file doing
// exactly that on 18 Aug: a sixth status added above exam_ready would have
// been counted by the ladder and missed by this copy.

interface SectionTally {
  section: string;
  total: number;
  opened: number;
  untouched: number;
  atDepth: number;
}

function tally(coverage: CoverageRow[], section: string): SectionTally {
  const rows = coverage.filter((r) => r.section === section);
  return {
    section,
    total: rows.length,
    opened: rows.filter((r) => isOpened(r.status)).length,
    untouched: rows.filter((r) => !isOpened(r.status)).length,
    atDepth: rows.filter((r) => isAtRevisionDepth(r.status)).length,
  };
}

/**
 * One true sentence about what today's log means against the syllabus.
 * Returns null only when there is genuinely nothing to say (no coverage rows
 * at all AND no logging history) — the route treats null as "omit the line",
 * which for any real student should effectively never happen.
 */
export function coverageInsight(input: LogInsightInput): string | null {
  const { coverage, todaySections, isRest, loggedDayCount, loggedDaysLast7 } = input;

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
      .map((s) => tally(coverage, s))
      .filter((t) => t.total > 0);

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
      const best = tallies
        .filter((t) => t.opened > 0)
        .sort((a, b) => b.opened / b.total - a.opened / a.total)[0];
      if (best) {
        const pct = Math.round((best.opened / best.total) * 100);
        return `${best.section}: ${best.opened} of ${best.total} topics opened — ${pct}% of the section on the board.`;
      }

      // Studied a core section but every topic still reads not_started (log
      // preceded any coverage advance): count the day, promise the number.
      return `Counted. As ${tallies[0].section} topics start moving, this line will carry your section numbers.`;
    }
  }

  // Mock/Revision-only day (no core section named): the whole-syllabus fact.
  const whole = CORE_SECTIONS.map((s) => tally(coverage, s)).reduce(
    (acc, t) => ({ opened: acc.opened + t.opened, total: acc.total + t.total }),
    { opened: 0, total: 0 }
  );
  if (whole.total > 0 && whole.opened > 0) {
    const pct = Math.round((whole.opened / whole.total) * 100);
    return `Across the syllabus: ${whole.opened} of ${whole.total} topics opened (${pct}%).`;
  }

  // No coverage rows at all — fall back to the one number every log creates.
  return loggedDayCount > 1
    ? `Day counted — that's ${loggedDayCount} logged days of your preparation on record.`
    : null;
}
