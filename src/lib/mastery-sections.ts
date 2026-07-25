// Section registry — the one place that maps a URL section param ('qa','dilr',
// later 'varc') to its graph, engine, and per-section DB flag columns. The
// generic /api/mastery/[section] routes and the /student/plan/[section] UI read
// from here, so adding VARC later is one entry, not a new stack.

import { QA_GRAPH, qaEngine } from './qa-mastery-engine';
import { DILR_GRAPH, dilrEngine } from './dilr-mastery-engine';
import { VARC_GRAPH, varcEngine } from './varc-mastery-engine';
import type { SectionGraph, MasteryTopicSpec, createMasteryEngine } from './mastery-engine';
import { isSectionReconciled, driftMessage, type Section } from './prep-model';

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
  varc: {
    key: 'VARC', label: 'VARC',
    graph: VARC_GRAPH as unknown as SectionGraph<MasteryTopicSpec>,
    engine: varcEngine as unknown as AnyEngine,
    enabledCol: 'varc_model_enabled', bonusCol: 'varc_include_bonus',
  },
};

export function sectionConfig(param: string | undefined | null): SectionConfig | null {
  return param ? (SECTIONS[param.toLowerCase()] ?? null) : null;
}

/**
 * Is this section's plan model in sync with the hours we quote the student?
 *
 * The graphs below imply their own hour totals through their session counts,
 * and those totals disagree with the canonical syllabus model (QA 238h implied
 * vs 199h canonical). While a section is dormant that's an internal
 * inconsistency; the moment it serves a plan it becomes a student seeing two
 * different answers to "how much work is left". So a drifted section is
 * treated as switched off, whatever the flag says.
 *
 * All three fail this today. That is the intended state — it makes the
 * reconciliation a precondition of launch instead of something a student finds.
 */
export function isSectionReady(cfg: SectionConfig): boolean {
  return isSectionReconciled(cfg.key as Section, cfg.graph);
}

export function sectionNotReadyReason(cfg: SectionConfig): string {
  return driftMessage(cfg.key as Section, cfg.graph);
}

// ── Cross-section time weighting ─────────────────────────────────────────
// Toppers don't split prep evenly. QA carries the widest syllabus (33 core
// topics vs ~14 each for DILR/VARC) and the most independent formula work, so
// it earns the largest daily share; DILR and VARC are lighter on new-topic
// load and lean more on repeated exposure. These are the founder-approved
// priors (QA heaviest), calibrated against topper study patterns — not an even
// third each. Shares are normalised over whichever sections a student has the
// mastery model enabled for, so a QA-only student still gets 100% of their
// time on QA.
export const SECTION_WEIGHTS: Record<string, number> = { QA: 0.40, DILR: 0.30, VARC: 0.30 };

// The fraction of a student's daily study budget this section should get, given
// the full set of sections they have enabled. Falls back to an even split if a
// key is somehow unweighted, and to 1 (whole budget) when nothing else is on.
export function sectionBudgetShare(sectionKey: string, enabledKeys: string[]): number {
  const keys = enabledKeys.length > 0 ? enabledKeys : [sectionKey];
  const weightOf = (k: string) => SECTION_WEIGHTS[k] ?? 0.30;
  const total = keys.reduce((s, k) => s + weightOf(k), 0);
  if (total <= 0) return 1 / keys.length;
  return weightOf(sectionKey) / total;
}
