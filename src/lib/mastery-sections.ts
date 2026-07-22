// Section registry — the one place that maps a URL section param ('qa','dilr',
// later 'varc') to its graph, engine, and per-section DB flag columns. The
// generic /api/mastery/[section] routes and the /student/plan/[section] UI read
// from here, so adding VARC later is one entry, not a new stack.

import { QA_GRAPH, qaEngine } from './qa-mastery-engine';
import { DILR_GRAPH, dilrEngine } from './dilr-mastery-engine';
import type { SectionGraph, MasteryTopicSpec, createMasteryEngine } from './mastery-engine';

type AnyEngine = ReturnType<typeof createMasteryEngine<MasteryTopicSpec>>;

export interface SectionConfig {
  key: string;      // the DB `section` value ('QA' | 'DILR' | 'VARC')
  label: string;    // human name
  graph: SectionGraph<MasteryTopicSpec>;
  engine: AnyEngine;
  enabledCol: string; // profiles column gating rollout
  bonusCol: string;   // profiles column for the bonus opt-in
}

// The engines are bound to their own narrow spec types; casting to the generic
// engine here is runtime-safe (topics are plain strings everywhere).
const SECTIONS: Record<string, SectionConfig> = {
  qa: {
    key: 'QA', label: 'Quant',
    graph: QA_GRAPH as unknown as SectionGraph<MasteryTopicSpec>,
    engine: qaEngine as unknown as AnyEngine,
    enabledCol: 'qa_model_enabled', bonusCol: 'qa_include_bonus',
  },
  dilr: {
    key: 'DILR', label: 'DILR',
    graph: DILR_GRAPH as unknown as SectionGraph<MasteryTopicSpec>,
    engine: dilrEngine as unknown as AnyEngine,
    enabledCol: 'dilr_model_enabled', bonusCol: 'dilr_include_bonus',
  },
};

export function sectionConfig(param: string | undefined | null): SectionConfig | null {
  return param ? (SECTIONS[param.toLowerCase()] ?? null) : null;
}
