// The Decision Engine — four boxes, nothing else: diff → events → priority →
// template. No AI anywhere in this file, on purpose. Every example in the
// founder's spec ("Geometry today. Revision is due.") is a template fill,
// not a writing problem — an LLM call in a nightly batch across every
// student adds latency, cost, and a failure mode (a 503 silently drops a
// student's notification) for zero quality gain on an 8-word sentence.
// Infrastructure must survive vendors; templates always can.
//
// Pure and parse-free like every other engine in this codebase: the caller
// resolves "today," fetches the rows, this only decides what — if
// anything — is worth telling the student. Silence is a valid, common
// output — that's the whole point.

export type DecisionEventType = 'revision_due' | 'topic_earned' | 'mission_changed' | 'weekly_evolved' | 'inactive_recovery';

export interface DecisionEvent {
  type: DecisionEventType;
  priority: number;
  topic?: string | null;
  extra?: string | null;
}

// Fixed priority ladder. Revision slipping outranks a routine plan
// reshuffle; a plan reshuffle outranks a weekly summary; nothing outranks
// silence when nothing fired at all.
const PRIORITY: Record<DecisionEventType, number> = {
  revision_due: 90,
  topic_earned: 85,
  mission_changed: 80,
  weekly_evolved: 70,
  inactive_recovery: 60,
};

export interface CoverageSignalRow {
  topic: string;
  status: 'not_started' | 'learning' | 'practicing' | 'revising' | 'exam_ready';
  updatedAt: string; // ISO
}

// Fires every day a topic is overdue, not just the day it crosses —
// "overdue events should persist until resolved, not disappear forever."
// This is self-limiting without a separate cooldown table: the moment the
// student actually revises the topic, updatedAt resets, daysSince drops to
// 0, and the event stops qualifying — resolution silences it, nothing
// else needs to. Uses the same raw TOPIC_METADATA.revisionFrequencyDays
// comparison the Preparation Map itself displays (CoverageMatrix.
// isRevisionDue) — not the archetype-adjusted version topic-selector uses
// internally. A notification that disagrees with what the student sees on
// screen is the "I revised it yesterday" trust failure; matching the
// visible source of truth is not optional here.
export function detectRevisionDue(
  rows: CoverageSignalRow[],
  today: string,
  revisionFrequencyDays: Record<string, number>
): DecisionEvent | null {
  for (const row of rows) {
    if (row.status !== 'practicing' && row.status !== 'revising' && row.status !== 'exam_ready') continue;
    const freq = revisionFrequencyDays[row.topic];
    if (freq == null) continue;
    const daysSince = Math.round((Date.parse(today) - Date.parse(row.updatedAt)) / 86_400_000);
    if (daysSince >= Math.round(freq) + 1) {
      return { type: 'revision_due', priority: PRIORITY.revision_due, topic: row.topic };
    }
  }
  return null;
}

// Fires the day a topic is EARNED into exam_ready (a green confidence tap
// on a revising topic — see applyConfidenceSignal) — never self-declared,
// so this is always real news, not a status the student just clicked.
export function detectTopicEarned(rows: CoverageSignalRow[], today: string): DecisionEvent | null {
  const earned = rows.find((r) => r.status === 'exam_ready' && r.updatedAt.slice(0, 10) === today);
  return earned ? { type: 'topic_earned', priority: PRIORITY.topic_earned, topic: earned.topic } : null;
}

// Fires only on a SECTION change (VARC → QA), not a topic change within the
// same section — the routine engine rotates the priority topic often
// enough that a topic-level diff would fire almost daily, which is a
// reminder wearing an event's clothes. A section-level shift is rare and
// genuinely worth a line.
export function detectMissionChanged(
  yesterdayFirstSection: string | null,
  todayFirstSection: string | null,
  todayFirstTopic: string | null
): DecisionEvent | null {
  if (!yesterdayFirstSection || !todayFirstSection) return null;
  if (yesterdayFirstSection === todayFirstSection) return null;
  return { type: 'mission_changed', priority: PRIORITY.mission_changed, topic: todayFirstTopic };
}

// Sunday-only, and only when there's a real diff to report — an empty week
// says nothing, not "nothing changed" padded out to look like content.
export function detectWeeklyEvolved(isSunday: boolean, weeklyEvolutionLines: string[]): DecisionEvent | null {
  if (!isSunday || weeklyEvolutionLines.length === 0) return null;
  return { type: 'weekly_evolved', priority: PRIORITY.weekly_evolved, extra: weeklyEvolutionLines[0] };
}

// The one deliberate exception to "only notify on positive change": going
// quiet for 3+ days is itself the most valuable signal in the whole
// system, and a silence-only engine would never recover a lapsed student.
// No guilt in the copy layer — see templateFor — this only decides WHETHER.
export function detectInactive(daysSinceLastLog: number | null): DecisionEvent | null {
  if (daysSinceLastLog == null || daysSinceLastLog < 3) return null;
  return { type: 'inactive_recovery', priority: PRIORITY.inactive_recovery };
}

// Single highest-priority event — still the right primitive when only one
// slot exists (e.g. testing a single detector in isolation).
export function pickTopEvent(events: (DecisionEvent | null)[]): DecisionEvent | null {
  const real = events.filter((e): e is DecisionEvent => e != null);
  if (real.length === 0) return null;
  return real.reduce((best, e) => (e.priority > best.priority ? e : best));
}

// The cron's actual selector: up to `cap` events, never manufactured — a
// day with one real thing sends one, a day with none sends none. Raising
// the cap from 1 to 2 isn't "send more"; it's "stop discarding the second
// genuinely independent thing that happened" (the losing-event bug this
// function replaces pickTopEvent-in-the-cron to fix). The one guarantee:
// on a Sunday where weekly_evolved fired, it always claims a slot — "Sunday
// evolution, always" — rather than competing on priority against whatever
// else happened that day and possibly losing.
export function selectEvents(events: (DecisionEvent | null)[], cap: number): DecisionEvent[] {
  const real = events.filter((e): e is DecisionEvent => e != null);
  if (real.length === 0) return [];
  const weekly = real.find((e) => e.type === 'weekly_evolved');
  const rest = real.filter((e) => e.type !== 'weekly_evolved').sort((a, b) => b.priority - a.priority);
  if (weekly) return [weekly, ...rest.slice(0, Math.max(0, cap - 1))];
  return rest.slice(0, cap);
}

export interface DecisionEventTemplate { title: string; body: string; url: string }

// Action + reason. Never a paragraph, never a sell, never guilt. "Explain
// why" lives inside the app (the observation card on My CAT Plan); the
// notification itself is the fact.
export function templateFor(event: DecisionEvent): DecisionEventTemplate {
  switch (event.type) {
    case 'revision_due':
      return { title: `${event.topic} today`, body: 'Revision is due.', url: '/student/tracker' };
    case 'topic_earned':
      return { title: `${event.topic} → Exam ready 🟢`, body: 'Nice work.', url: '/student/blueprint' };
    case 'mission_changed':
      return { title: "Today's plan changed", body: `${event.topic} comes first.`, url: '/student/tracker' };
    case 'weekly_evolved':
      return { title: 'Your CAT Plan evolved', body: event.extra ?? 'See what changed this week.', url: '/student/tracker' };
    case 'inactive_recovery':
      return { title: 'Picked up where you left off', body: "Today's first task is ready.", url: '/student/tracker' };
  }
}
