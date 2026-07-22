// VARC Mastery Engine — the section-agnostic mastery-engine bound to the VARC
// topic graph. Identical wiring to qa-/dilr-mastery-engine.ts; only the graph
// differs. RC_SKILLS (tracked dimensions) live in the topic graph, not here.

import { createMasteryEngine, type SectionGraph } from './mastery-engine';
import { VARC_TOPICS, VARC_TOPICS_BY_NAME, VARC_CORE_TOPICS, VARC_CLUSTERS, VARC_STAGE_ORDER, type VarcTopicSpec } from './varc-topic-graph';

export const VARC_GRAPH: SectionGraph<VarcTopicSpec> = {
  topics: VARC_TOPICS,
  byName: VARC_TOPICS_BY_NAME,
  coreTopics: VARC_CORE_TOPICS,
  clusters: VARC_CLUSTERS,
  stageOrder: VARC_STAGE_ORDER,
  defaultCluster: 'Reading Comprehension', // RC is the largest, most exam-heavy VARC cluster — deterministic tie-break
};

export const varcEngine = createMasteryEngine<VarcTopicSpec>(VARC_GRAPH);
