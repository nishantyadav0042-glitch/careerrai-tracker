import { isRevisionDue, isRevisableStatus } from './revision-due';
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
import { isCovered } from './coverage-status';

export interface CompletionRecord {
  routineDate: string; // YYYY-MM-DD
  section: Section | 'General';
  topic: string | null;
  estMinutes: number;
  confidence: 'green' | 'yellow' | 'red' | null;
  isEmergency: boolean;
}

export interface WindowStats {
  daysStudied: number;
  tasksCompleted: number;
  minutesStudied: number;
  topicsTouched: number;
  sectionCounts: Record<Section | 'General', number>;
  confidenceCounts: { green: number; yellow: number; red: number };
  mocksLogged: number;
  emergencyDays: number;
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
  const emergencyDaySet = new Set<string>();
  let minutes = 0;
  for (const r of rows) {
    sectionCounts[r.section] += 1;
    minutes += r.estMinutes;
    if (r.confidence) confidenceCounts[r.confidence] += 1;
    if (r.isEmergency) emergencyDaySet.add(r.routineDate);
  }

  return {
    daysStudied: days.size,
    tasksCompleted: rows.length,
    minutesStudied: minutes,
    topicsTouched: topics.size,
    sectionCounts,
    confidenceCounts,
    mocksLogged: mockDates.filter(inWindow).length,
    emergencyDays: emergencyDaySet.size,
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

// ─── Preparation Health % ───────────────────────────────────────────────────
// A single 0-100 composite, rolling 30 days (or since signup if shorter).
// Four deterministic components, same additive-score architecture as every
// other engine in this codebase — the breakdown IS the explanation, never a
// black-box number:
//   Consistency (35%)       — days with a completion ÷ days elapsed;
//                             emergency-only days count at half weight.
//   Confidence quality (25%) — of the tasks tapped with a confidence signal
//                             in the window, how many were "nailed it" vs
//                             "shaky" vs "lost." A student who shows up every
//                             day but taps red on everything is active, not
//                             actually preparing well — this is the signal
//                             that tells the two apart. Untagged windows (no
//                             topic-linked completions to tap) get half
//                             credit rather than a penalty or a free pass.
//   Balance (25%)           — full credit unless a section goes untouched
//                             beyond 4 consecutive days, then a proportional
//                             deduction (makes single-section farming a
//                             losing strategy, not a shortcut to a high score).
//   Revision discipline (15%) — of the topics actually overdue for revision
//                             (already 'practicing'/'exam_ready', past their
//                             revisionFrequencyDays), how many got revised
//                             in the window.
// Provisional (no number shown) under 7 days of history — a fabricated
// score from 2 days of data would be worse than no score at all.

export function consistencyBreakdown(
  completions: CompletionRecord[],
  startInclusive: string,
  endInclusive: string
): { daysWithCompletion: number; daysEmergencyOnly: number } {
  const inWindow = (d: string) => d >= startInclusive && d <= endInclusive;
  const byDate = new Map<string, CompletionRecord[]>();
  for (const c of completions) {
    if (!inWindow(c.routineDate)) continue;
    if (!byDate.has(c.routineDate)) byDate.set(c.routineDate, []);
    byDate.get(c.routineDate)!.push(c);
  }
  let daysEmergencyOnly = 0;
  for (const dayRecords of byDate.values()) {
    if (dayRecords.every((r) => r.isEmergency)) daysEmergencyOnly += 1;
  }
  return { daysWithCompletion: byDate.size, daysEmergencyOnly };
}

export function sectionGapDays(completions: CompletionRecord[], today: string): Record<Section, number | null> {
  const sections: Section[] = ['VARC', 'DILR', 'QA'];
  const result = {} as Record<Section, number | null>;
  for (const s of sections) {
    const dates = completions.filter((c) => c.section === s).map((c) => c.routineDate);
    if (dates.length === 0) { result[s] = null; continue; }
    const mostRecent = dates.reduce((a, b) => (b > a ? b : a));
    result[s] = Math.round((Date.parse(today) - Date.parse(mostRecent)) / 86_400_000);
  }
  return result;
}

export interface TopicCoverageRow { topic: string; status: string; updatedAt: string }

export function revisionDueStats(
  coverageRows: TopicCoverageRow[],
  completions: CompletionRecord[],
  today: string,
  revisionMultiplier: number,
  windowStart: string
): { due: number; completed: number } {
  const touchedTopicsInWindow = new Set(
    completions.filter((c) => c.routineDate >= windowStart && c.routineDate <= today && c.topic).map((c) => c.topic as string)
  );
  let due = 0;
  let completed = 0;
  for (const row of coverageRows) {
    if (!isCovered(row.status)) continue;
    const daysSinceUpdate = Math.round((Date.parse(today) - Date.parse(row.updatedAt)) / 86_400_000);
    if (isRevisionDue({ topic: row.topic, daysSince: daysSinceUpdate, multiplier: revisionMultiplier })) {
      due += 1;
      if (touchedTopicsInWindow.has(row.topic)) completed += 1;
    }
  }
  return { due, completed };
}

export interface HealthScore {
  status: 'provisional' | 'ready';
  score: number | null;
  components: { consistency: number; confidenceQuality: number; balance: number; revisionDiscipline: number } | null;
}

export function computeHealthScore(input: {
  windowDaysElapsed: number;
  daysWithCompletion: number;
  daysEmergencyOnly: number;
  confidenceCounts: { green: number; yellow: number; red: number };
  sectionGaps: Record<Section, number | null>;
  revisionDue: number;
  revisionCompleted: number;
}): HealthScore {
  if (input.windowDaysElapsed < 7) return { status: 'provisional', score: null, components: null };

  const effectiveDays = input.daysWithCompletion - 0.5 * input.daysEmergencyOnly;
  const consistency = Math.max(0, Math.min(35, (effectiveDays / input.windowDaysElapsed) * 35));

  const taggedTotal = input.confidenceCounts.green + input.confidenceCounts.yellow + input.confidenceCounts.red;
  const confidenceQuality = taggedTotal === 0
    ? 12.5
    : ((input.confidenceCounts.green * 1 + input.confidenceCounts.yellow * 0.5) / taggedTotal) * 25;

  const sections: Section[] = ['VARC', 'DILR', 'QA'];
  let balance = 25;
  for (const s of sections) {
    const gap = input.sectionGaps[s] ?? input.windowDaysElapsed;
    if (gap > 4) {
      const severity = Math.min(1, (gap - 4) / 10);
      balance -= severity * (25 / sections.length);
    }
  }
  balance = Math.max(0, balance);

  const revisionDiscipline = input.revisionDue === 0
    ? 15
    : Math.max(0, Math.min(15, (input.revisionCompleted / input.revisionDue) * 15));

  return {
    status: 'ready',
    score: Math.round(consistency + confidenceQuality + balance + revisionDiscipline),
    components: {
      consistency: Math.round(consistency),
      confidenceQuality: Math.round(confidenceQuality),
      balance: Math.round(balance),
      revisionDiscipline: Math.round(revisionDiscipline),
    },
  };
}

// ─── Blueprint confidence score ─────────────────────────────────────────────
// How much to trust the plan itself — separate from Health (which measures
// behavior, not data completeness). Additive penalty from 100, same
// architecture as every other score in this codebase: every deduction has a
// reason, and every reason names the concrete action that would remove it.
export interface BlueprintConfidence { score: number; reasons: string[] }

export function computeBlueprintConfidence(input: {
  mockCount: number;
  coverageTotal: number;
  hasStage: boolean;
  hasWeakTopic: boolean;
  daysStudiedLast30: number;
}): BlueprintConfidence {
  let score = 100;
  const reasons: string[] = [];
  if (input.mockCount === 0) {
    score -= 15;
    reasons.push('No mock logged yet — your baseline percentile is still an estimate.');
  }
  if (input.coverageTotal === 0) {
    score -= 15;
    reasons.push("Coverage Matrix not mapped yet — the plan is using calendar defaults, not your actual progress.");
  }
  if (!input.hasStage) {
    score -= 10;
    reasons.push('Prep stage never confirmed — phase is calendar-only.');
  }
  if (!input.hasWeakTopic) {
    score -= 5;
    reasons.push('Toughest topic never specified — using the section default instead.');
  }
  if (input.daysStudiedLast30 < 7) {
    score -= 15;
    reasons.push("Less than a week of tracked activity — too early to confirm the plan is working.");
  }
  return { score: Math.max(30, score), reasons: reasons.slice(0, 3) };
}

// ─── Blueprint Memory ───────────────────────────────────────────────────────
// "Did I / when did I" — a plain read over full history (not windowed to 30
// days like the rest of this file), answering questions a student would
// otherwise have to remember themselves. Pure queries over topic_coverage +
// completions, same as everything else here — no accuracy claims, since this
// is about study history, not mock performance.
export interface TopicMemoryEntry {
  topic: string;
  status: string; // CoverageStatus, or 'not_started' when the topic has no row at all
  /**
   * Did a coverage row actually exist for this topic?
   *
   * UNKNOWN ≠ ZERO (founder law, 18 Aug). `status` alone cannot tell these
   * apart, and its own comment above admits it: a student who declared
   * "haven't started" and a student who was never asked both read
   * 'not_started'. The first is a measured zero; the second is an absence of
   * evidence, and a consumer that counts it produces "0 topics done" about a
   * student it knows nothing about.
   *
   * Added rather than changing `status`, so every existing reader is
   * untouched — only consumers that need the distinction ask for it.
   */
  declared: boolean;
  firstTouchedDaysAgo: number | null;
  timesTouched: number;
  lastTouchedDaysAgo: number | null;
  revisionOverdue: boolean;
}

export function buildTopicMemory(
  allTopics: string[],
  allCompletions: CompletionRecord[],
  coverageRows: TopicCoverageRow[],
  today: string,
  revisionMultiplier: number
): TopicMemoryEntry[] {
  const coverageByTopic = new Map(coverageRows.map((r) => [r.topic, r]));

  return allTopics.map((topic) => {
    const coverageRow = coverageByTopic.get(topic);
    const status = coverageRow?.status ?? 'not_started';
    const declared = coverageRow !== undefined;

    const dates = allCompletions.filter((c) => c.topic === topic).map((c) => c.routineDate).sort();
    const firstDate = dates[0] ?? null;
    const lastCompletionDate = dates[dates.length - 1] ?? null;

    // "Last touched" also counts a manual Coverage Matrix edit, not just a
    // completed task — whichever signal is more recent wins.
    let lastTouchedDaysAgo: number | null = null;
    if (lastCompletionDate) lastTouchedDaysAgo = Math.round((Date.parse(today) - Date.parse(lastCompletionDate)) / 86_400_000);
    if (coverageRow?.updatedAt) {
      const coverageDaysAgo = Math.round((Date.parse(today) - Date.parse(coverageRow.updatedAt)) / 86_400_000);
      if (lastTouchedDaysAgo == null || coverageDaysAgo < lastTouchedDaysAgo) lastTouchedDaysAgo = coverageDaysAgo;
    }

    // ONE rule (lib/revision-due) — the same one the planner ranks by and the
    // same one the push notification fires on.
    let revisionOverdue = false;
    if (isRevisableStatus(status) && coverageRow?.updatedAt) {
      const daysSinceUpdate = Math.round((Date.parse(today) - Date.parse(coverageRow.updatedAt)) / 86_400_000);
      revisionOverdue = isRevisionDue({ topic, daysSince: daysSinceUpdate, multiplier: revisionMultiplier });
    }

    return {
      topic,
      declared,
      status,
      firstTouchedDaysAgo: firstDate ? Math.round((Date.parse(today) - Date.parse(firstDate)) / 86_400_000) : null,
      timesTouched: dates.length,
      lastTouchedDaysAgo,
      revisionOverdue,
    };
  });
}
