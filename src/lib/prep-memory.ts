// Preparation Memory v1 (Engine v2, Part 5) — a read view over data that
// already exists (routine_task_completions, daily_routines, mock_debriefs),
// not a new event-sourcing table. Answers "what has this student actually
// done," which both the Study Blueprint page and Weekly Evolution (Part 6,
// below) read from — the same "build from existing tables first" discipline
// the Coverage Matrix and Topic Selector already followed.
//
// Pure and parse-free like the other engines: no Date.now() in here — the
// caller resolves "today" once and passes date-window boundaries in.

import type { Section } from './routine-engine';

export interface CompletionRecord {
  routineDate: string; // YYYY-MM-DD
  section: Section | 'General';
  topic: string | null;
  estMinutes: number;
  confidence: 'green' | 'yellow' | 'red' | null;
}

export interface WindowStats {
  daysStudied: number;
  tasksCompleted: number;
  minutesStudied: number;
  topicsTouched: number;
  sectionCounts: Record<Section | 'General', number>;
  confidenceCounts: { green: number; yellow: number; red: number };
  mocksLogged: number;
}

const emptySectionCounts = (): Record<Section | 'General', number> => ({ VARC: 0, DILR: 0, QA: 0, General: 0 });

// YYYY-MM-DD strings compare correctly with plain string comparison — no
// Date parsing needed for the window check.
export function windowStats(
  completions: CompletionRecord[],
  mockDates: string[],
  startInclusive: string,
  endInclusive: string
): WindowStats {
  const inWindow = (d: string) => d >= startInclusive && d <= endInclusive;
  const rows = completions.filter((c) => inWindow(c.routineDate));

  const days = new Set(rows.map((r) => r.routineDate));
  const topics = new Set(rows.map((r) => r.topic).filter((t): t is string => t != null));
  const sectionCounts = emptySectionCounts();
  const confidenceCounts = { green: 0, yellow: 0, red: 0 };
  let minutes = 0;
  for (const r of rows) {
    sectionCounts[r.section] += 1;
    minutes += r.estMinutes;
    if (r.confidence) confidenceCounts[r.confidence] += 1;
  }

  return {
    daysStudied: days.size,
    tasksCompleted: rows.length,
    minutesStudied: minutes,
    topicsTouched: topics.size,
    sectionCounts,
    confidenceCounts,
    mocksLogged: mockDates.filter(inWindow).length,
  };
}

export interface MockTrend {
  count: number;
  latestPercentile: number | null;
  previousPercentile: number | null;
}

// sortedDebriefsDesc must already be ordered most-recent-first — this stays a
// pure array op rather than re-sorting, so the caller's DB query order is
// the single source of truth for "most recent."
export function mockTrend(sortedDebriefsDesc: { overallPercentile: number | null }[]): MockTrend {
  const withPercentile = sortedDebriefsDesc.filter((d) => d.overallPercentile != null);
  return {
    count: sortedDebriefsDesc.length,
    latestPercentile: withPercentile[0]?.overallPercentile ?? null,
    previousPercentile: withPercentile[1]?.overallPercentile ?? null,
  };
}

// Weekly evolution (Engine v2, Part 6): a plain-language diff between two
// adjacent 7-day windows — deterministic arithmetic, not AI narration. Only
// emits a line where there's an actual signal; a 0-vs-0 metric says nothing
// and is omitted rather than padded out with filler ("rules before AI," and
// no line without a real number behind it).
export function weeklyEvolutionLines(thisWeek: WindowStats, lastWeek: WindowStats): string[] {
  const lines: string[] = [];

  if (thisWeek.tasksCompleted > 0 || lastWeek.tasksCompleted > 0) {
    const delta = thisWeek.tasksCompleted - lastWeek.tasksCompleted;
    if (delta > 0) lines.push(`Tasks completed: ${thisWeek.tasksCompleted} this week vs ${lastWeek.tasksCompleted} last week — up ${delta}.`);
    else if (delta < 0) lines.push(`Tasks completed: ${thisWeek.tasksCompleted} this week vs ${lastWeek.tasksCompleted} last week — down ${Math.abs(delta)}.`);
    else lines.push(`Tasks completed: steady at ${thisWeek.tasksCompleted}, same as last week.`);
  }

  if (thisWeek.minutesStudied > 0 || lastWeek.minutesStudied > 0) {
    const delta = thisWeek.minutesStudied - lastWeek.minutesStudied;
    if (Math.abs(delta) >= 15) {
      const thisHrs = Math.round(thisWeek.minutesStudied / 6) / 10;
      const lastHrs = Math.round(lastWeek.minutesStudied / 6) / 10;
      lines.push(delta > 0
        ? `Study time: ${thisHrs}h this week vs ${lastHrs}h last week — up.`
        : `Study time: ${thisHrs}h this week vs ${lastHrs}h last week — down.`);
    }
  }

  if (thisWeek.confidenceCounts.green > 0 || lastWeek.confidenceCounts.green > 0) {
    const delta = thisWeek.confidenceCounts.green - lastWeek.confidenceCounts.green;
    if (delta > 0) lines.push(`Confidence: ${thisWeek.confidenceCounts.green} "nailed it" taps this week vs ${lastWeek.confidenceCounts.green} last week — trending up.`);
    else if (delta < 0) lines.push(`Confidence: ${thisWeek.confidenceCounts.green} "nailed it" taps this week vs ${lastWeek.confidenceCounts.green} last week — fewer than last week.`);
  }

  if (thisWeek.mocksLogged > 0 || lastWeek.mocksLogged > 0) {
    const delta = thisWeek.mocksLogged - lastWeek.mocksLogged;
    if (delta !== 0) lines.push(`Mocks: ${thisWeek.mocksLogged} this week vs ${lastWeek.mocksLogged} last week.`);
  }

  return lines;
}
