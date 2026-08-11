// ── Today's topics, for one student — the single implementation ─────────────
//
// This function existed twice, byte for byte: once in api/routine/today (the
// tracker's hot path) and once in lib/routine-plan (the 6am notification cron,
// which generates and PERSISTS the same daily_routines row before the student
// ever opens the app). They were kept in step by a comment asking whoever
// edited one to remember the other — and that comment records the day it
// failed: the cron's copy had silently dropped `revisionSeason`, so from 1
// September the notification would have named a different plan than the app.
//
// Founder, 11 Aug: "There is exactly one planning authority in CareerRai."
// A copy is not an authority. This is the one implementation; both callers
// import it, and lib/plan-projection walks the same chooseSectionDay forward
// for the days after today.

import {
  archetypeRevisionMultiplier,
  MAX_TOPIC_BLOCKS_PER_SECTION,
  type RoutineProfile,
  type Section,
  type HistoryInput,
} from './routine-engine';
import { chooseSectionDay, type TopicChoice, type CoverageStatus } from './topic-selector';
import { syllabusPace } from './syllabus-pace';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS, QA_GROUPS } from './topics-constants';

export const TOPICS_BY_SECTION: Record<Section, string[]> = {
  VARC: VERBAL_TOPICS,
  DILR: LRDI_TOPICS,
  QA: QUANT_TOPICS,
};

export interface DayTopicHistory extends HistoryInput {
  daysSinceLastPracticedByTopic: Record<string, number | null>;
  daysSincePlannedByTopic?: Record<string, number | null>;
  postponedTopics: string[];
}

export interface DayTopicChoices {
  /** The lead topic per section — what generateRoutine builds the day around. */
  choices: Record<Section, TopicChoice>;
  /** All of the day's distinct picks per section, best first. */
  extras: Partial<Record<Section, TopicChoice[]>>;
}

export function buildTopicChoices(
  coverageRows: { topic: string; status: string; is_priority?: boolean | null }[],
  profile: RoutineProfile,
  history: DayTopicHistory,
  startWith?: string | null,
  todayClassTopics: string[] = [],
  /** Days until the student's chosen syllabus-finish date; null = not set. */
  daysToSyllabusTarget: number | null = null,
  now: Date = new Date(),
): DayTopicChoices {
  const coverageByTopic = new Map<string, CoverageStatus>();
  const prioritySet = new Set<string>();
  for (const row of coverageRows) {
    coverageByTopic.set(row.topic, row.status as CoverageStatus);
    if (row.is_priority === true) prioritySet.add(row.topic);
  }

  // "Start my preparation with <cluster>" → every topic in that QA cluster
  // gets the focus bonus. Null/unknown = "Let CareerRai decide" (no bias).
  const focusUnits = new Set<string>(
    startWith ? (QA_GROUPS.find((g) => g.label === startWith)?.units ?? []) : []
  );
  const postponed = new Set(history.postponedTopics);
  const todayClass = new Set(todayClassTopics);

  const revisionMultiplier = archetypeRevisionMultiplier(profile);
  // Revision season: from 1 September of the exam year, overdue revision of
  // high-weightage topics outranks starting new material (topic-selector.ts).
  const seasonYear = profile.attemptYear ?? now.getFullYear();
  const revisionSeason = now >= new Date(seasonYear, 8, 1);
  const sections: Section[] = ['VARC', 'DILR', 'QA'];
  const result = {} as Record<Section, TopicChoice>;
  const extras: Partial<Record<Section, TopicChoice[]>> = {};

  for (const section of sections) {
    const isWeakSection = section === profile.weakestSection;
    const candidates = TOPICS_BY_SECTION[section].map((topic) => ({
      topic,
      coverageStatus: coverageByTopic.get(topic) ?? null,
      daysSinceLastPracticed: history.daysSinceLastPracticedByTopic[topic] ?? null,
      selfReportedBonus: isWeakSection && topic === profile.weakTopic,
      priorityBonus: prioritySet.has(topic),
      focusBonus: focusUnits.has(topic),
      postponedBonus: postponed.has(topic),
      todayClassBonus: todayClass.has(topic),
      daysSincePlanned: history.daysSincePlannedByTopic?.[topic] ?? null,
    }));
    // Does this plan finish? Per section, against the student's own date.
    const untouched = candidates.filter(
      (c) => c.coverageStatus == null || c.coverageStatus === 'not_started'
    ).length;
    const pace = daysToSyllabusTarget == null
      ? { pressure: 0 }
      : syllabusPace({ untouchedTopics: untouched, daysToTarget: daysToSyllabusTarget });
    // Two clocks, split before ranking: the syllabus clock reserves the
    // first-contact blocks it needs to finish on time, the memory clock gets
    // the rest. See topic-selector.chooseSectionDay.
    //
    // Asked at the FULL block capacity and sliced down by generateRoutine, on
    // purpose: chooseSectionDay's output is prefix-consistent (asking for 3 and
    // taking the first 1 gives the same topic as asking for 1), so a long day
    // and a short one agree about what comes first.
    const picks = chooseSectionDay(candidates, MAX_TOPIC_BLOCKS_PER_SECTION, {
      untouchedCount: untouched,
      daysToTarget: daysToSyllabusTarget,
      revisionMultiplier, revisionSeason, newTopicPressure: pace.pressure,
    });
    result[section] = picks[0];
    extras[section] = picks;
  }
  return { choices: result, extras };
}
