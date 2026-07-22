// DILR Mastery Engine — the section-agnostic mastery-engine bound to the DILR
// topic graph. Identical wiring to qa-mastery-engine.ts; only the graph differs.

import { createMasteryEngine, type SectionGraph } from './mastery-engine';
import { DILR_TOPICS, DILR_TOPICS_BY_NAME, DILR_CORE_TOPICS, DILR_CLUSTERS, DILR_STAGE_ORDER, type DilrTopicSpec } from './dilr-topic-graph';

export const DILR_GRAPH: SectionGraph<DilrTopicSpec> = {
  topics: DILR_TOPICS,
  byName: DILR_TOPICS_BY_NAME,
  coreTopics: DILR_CORE_TOPICS,
  clusters: DILR_CLUSTERS,
  stageOrder: DILR_STAGE_ORDER,
  defaultCluster: 'Data Interpretation', // foundational DILR cluster — deterministic tie-break
};

export const dilrEngine = createMasteryEngine<DilrTopicSpec>(DILR_GRAPH);
