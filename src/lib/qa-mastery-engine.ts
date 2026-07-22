// QA Mastery Engine — now a thin binding of the section-agnostic
// mastery-engine to the QA topic graph. All the logic lives in
// mastery-engine.ts; this file just wires it to QA and keeps the SAME exported
// names + types, so the QA API routes and /student/qa never had to change.

import { createMasteryEngine, stageLabel, SESSION_MINUTES, REVISION_SESSION_MINUTES, type SectionGraph, type MasteryStudentState } from './mastery-engine';
import { QA_TOPICS, QA_TOPICS_BY_NAME, QA_CORE_TOPICS, QA_CLUSTERS, QA_STAGE_ORDER, type QaTopicSpec } from './qa-topic-graph';

export const QA_GRAPH: SectionGraph<QaTopicSpec> = {
  topics: QA_TOPICS,
  byName: QA_TOPICS_BY_NAME,
  coreTopics: QA_CORE_TOPICS,
  clusters: QA_CLUSTERS,
  stageOrder: QA_STAGE_ORDER,
  defaultCluster: 'Arithmetic', // biggest, most foundational QA cluster — deterministic tie-break
};

const engine = createMasteryEngine<QaTopicSpec>(QA_GRAPH);

export const {
  progressFor, topicRoi, isUnlocked, weakestCluster, pickActiveTopics, swapTopic, splitTimeBudget,
  sessionsForBudget, advanceIfReady, revisionFrequencyDays, dueRevision, taskCopy,
  applyStudySession, applyRevisionSession, applyMockResults, dominantStruggle, swapCandidates, coreProgress,
} = engine;

export { stageLabel, SESSION_MINUTES, REVISION_SESSION_MINUTES };

// Types — re-exported (QaStudentState kept as the historical name callers use).
export type QaStudentState = MasteryStudentState;
export type {
  StudentTopicProgress, ErrorType, ActiveTopicSelection, SwapResult, TimeSplit,
  TopicSessionPlan, AdvanceResult, RevisionTask, StudySessionLog, MockTopicResult,
} from './mastery-engine';
