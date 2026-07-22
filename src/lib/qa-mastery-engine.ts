// QA Mastery Engine (Section C) — turns the QA Topic Graph into today's plan.
// Deterministic and explainable, no LLM, matching every other engine in this
// codebase. Pure functions; the caller (a future API route) supplies student
// state and gets back a plan + reasons.
//
// Implements, in order, every C decision:
//   C1 topic ordering    — prerequisites are a hard gate; ROI breaks ties among
//                          unlocked topics.
//   C2 parallelism       — 2 active topics: the top-ROI unlocked topic in the
//                          student's weakest cluster, plus the top-ROI unlocked
//                          topic from a different cluster.
//   C3 time split        — hybrid: proportional to weightage, with a floor so
//                          the smaller topic never gets token minutes.
//   C4 exam-ready gate   — self-report alone (trust the student); no timed
//                          test blocks it. Advancing ANY stage requires both
//                          the prescribed sessions done AND the tap (Section B).
//   C5 bonus topics      — excluded from selection unless the student opted in
//                          (via includeBonus), OR once every core topic is
//                          exam_ready (a strong student's natural next step).
//   C6 revision vs new   — revision is short and additive, never competing for
//                          the main slot; see revisionDue() + reviseTasksForToday().
//   Swap                 — swapTopic() lets a student override either active
//                          slot with any other unlocked, not-yet-exam_ready
//                          topic; the swapped-out topic's progress is untouched
//                          (never deleted), matching the existing product-wide
//                          "postpone, never delete" pattern.

import { QA_TOPICS, QA_TOPICS_BY_NAME, QA_CORE_TOPICS, QA_STAGE_ORDER, type QaTopicSpec, type QaStage, type QaCluster } from './qa-topic-graph';

// ── Session length (Section A1) — stage-specific, not flat. ────────────────
export const SESSION_MINUTES: Record<QaStage, number> = { concept: 25, easy: 40, medium: 40, hard: 40, exam_ready: 40 };
export const REVISION_SESSION_MINUTES = 20;

// Where a "Need more" tap says the struggle came from (Section D2) — a small,
// optional signal captured only on a bad session; the seed of the coach's
// "you slip on calculation, not concept" read over time.
export type ErrorType = 'concept' | 'calculation';

export interface StudentTopicProgress {
  topic: string;
  stage: QaStage;
  sessionsDoneAtStage: number; // resets to 0 on advancing
  // Counts up toward spec.initialRevisionSessions once the topic first
  // reaches exam_ready — the consolidation burst (file header, correction #2).
  initialRevisionSessionsDone: number;
  lastTouchedDaysAgo: number | null; // null = never touched
  // ── Section D behaviour memory ──
  conceptStruggles: number;      // D2: "Need more" + "didn't get the concept"
  calcStruggles: number;         // D2: "Need more" + "calculation slip"
  revisionMisses: number;        // D3: times a revision session came back "went cold" — decays faster for this student, so tighten its cycle
  mockFlaggedForRevision: boolean; // D4: a weekly mock exposed this (already exam-ready) topic — jumps the decay queue
}

export interface QaStudentState {
  includeBonus: boolean; // set at onboarding (C5), editable later
  progressByTopic: Map<string, StudentTopicProgress>;
  swappedIn: Partial<Record<'priority' | 'secondary', string>>; // today's manual overrides
}

export function progressFor(state: QaStudentState, topic: string): StudentTopicProgress {
  return state.progressByTopic.get(topic) ?? {
    topic, stage: 'concept', sessionsDoneAtStage: 0, initialRevisionSessionsDone: 0, lastTouchedDaysAgo: null,
    conceptStruggles: 0, calcStruggles: 0, revisionMisses: 0, mockFlaggedForRevision: false,
  };
}

// ── C1: ordering ─────────────────────────────────────────────────────────

// ROI — marks value per unit effort. A defensible PRIOR (real CAT weightage
// ÷ the topic's own total session cost), not a guess — calibrate against real
// percentile outcomes once we have mock data (see docs/OS/LEARNING-INTELLIGENCE-GRAPH.md).
export function topicRoi(spec: QaTopicSpec): number {
  const totalSessions = spec.sessions.concept + spec.sessions.easy + spec.sessions.medium + spec.sessions.hard;
  return totalSessions > 0 ? spec.weightage / totalSessions : 0;
}

// A topic unlocks once every prerequisite has reached exam_ready. No
// prerequisites = unlocked from day one.
export function isUnlocked(spec: QaTopicSpec, state: QaStudentState): boolean {
  return spec.prerequisites.every((p) => progressFor(state, p).stage === 'exam_ready');
}

function allCoreExamReady(state: QaStudentState): boolean {
  return QA_CORE_TOPICS.every((t) => progressFor(state, t.topic).stage === 'exam_ready');
}

// C5: which topics are even eligible for selection today — core always; bonus
// only if the student opted in, OR every core topic is already mastered (the
// natural "what's next" moment for a strong student).
function eligiblePool(state: QaStudentState): QaTopicSpec[] {
  const bonusOpen = state.includeBonus || allCoreExamReady(state);
  return QA_TOPICS.filter((t) => !t.isBonus || bonusOpen);
}

// Unlocked AND not yet mastered — the real "could work on this today" set.
function selectablePool(state: QaStudentState): QaTopicSpec[] {
  return eligiblePool(state).filter((t) => isUnlocked(t, state) && progressFor(state, t.topic).stage !== 'exam_ready');
}

function bestInPool(pool: QaTopicSpec[], exclude: Set<string>): QaTopicSpec | null {
  const candidates = pool.filter((t) => !exclude.has(t.topic)).sort((a, b) => topicRoi(b) - topicRoi(a));
  return candidates[0] ?? null;
}

// ── C2: pick the 2 active topics ────────────────────────────────────────

export interface ActiveTopicSelection {
  priority: QaTopicSpec; // from the weakest cluster
  secondary: QaTopicSpec | null; // from a different cluster; null if nothing else is unlocked
  reasons: { priority: string; secondary: string | null };
}

// "Weakest cluster" — the cluster with the least progress relative to its own
// size (share of topics still below exam_ready). Ties break by QA_CLUSTERS
// order (Arithmetic first — CAT's biggest, most foundational cluster; a
// deterministic, stated default, not a guess).
export function weakestCluster(state: QaStudentState): QaCluster {
  const clusters: QaCluster[] = ['Arithmetic', 'Algebra', 'Geometry', 'Number System', 'Modern Math'];
  let best: { c: QaCluster; score: number } | null = null;
  for (const c of clusters) {
    const inCluster = QA_CORE_TOPICS.filter((t) => t.cluster === c);
    if (inCluster.length === 0) continue;
    const unfinished = inCluster.filter((t) => progressFor(state, t.topic).stage !== 'exam_ready').length;
    const score = unfinished / inCluster.length;
    if (best == null || score > best.score) best = { c, score };
  }
  return best?.c ?? 'Arithmetic';
}

export function pickActiveTopics(state: QaStudentState): ActiveTopicSelection {
  const pool = selectablePool(state);
  const weak = weakestCluster(state);

  // Swap overrides win outright, as long as they're still valid (unlocked,
  // not yet mastered) — a student's explicit choice is trusted, never silently
  // discarded (C1's prerequisite gate still applies: swap only offers valid topics).
  const swappedPriority = state.swappedIn.priority ? QA_TOPICS_BY_NAME.get(state.swappedIn.priority) : undefined;
  const swappedSecondary = state.swappedIn.secondary ? QA_TOPICS_BY_NAME.get(state.swappedIn.secondary) : undefined;
  const priorityValid = swappedPriority && pool.includes(swappedPriority);
  const secondaryValid = swappedSecondary && pool.includes(swappedSecondary);

  const weakPool = pool.filter((t) => t.cluster === weak);
  const priority = priorityValid ? swappedPriority! : (bestInPool(weakPool, new Set()) ?? bestInPool(pool, new Set()));
  if (!priority) {
    // Nothing selectable at all — everything unlocked is mastered, or nothing
    // is unlocked yet (shouldn't happen: topics with no prerequisites always
    // unlock). Caller should read this as "QA plan complete."
    throw new Error('No selectable QA topic — all unlocked topics are exam_ready');
  }

  const otherPool = pool.filter((t) => t.cluster !== priority.cluster);
  const secondary = secondaryValid ? swappedSecondary! : bestInPool(otherPool, new Set([priority.topic]));

  return {
    priority, secondary,
    reasons: {
      priority: priorityValid ? 'You chose this' : `${priority.cluster} is your weakest cluster right now`,
      secondary: secondary ? (secondaryValid ? 'You chose this' : `Highest-value topic outside ${priority.cluster}, for variety`) : null,
    },
  };
}

// ── Swap ─────────────────────────────────────────────────────────────────

export interface SwapResult { ok: boolean; reason: string | null }

// Validates and records a swap. The outgoing topic's progress is left exactly
// as-is in state.progressByTopic — nothing is deleted, matching the existing
// "postpone, never delete" pattern already live in routine-engine.ts.
export function swapTopic(state: QaStudentState, slot: 'priority' | 'secondary', requestedTopic: string): SwapResult {
  const spec = QA_TOPICS_BY_NAME.get(requestedTopic);
  if (!spec) return { ok: false, reason: 'Unknown topic' };
  if (!isUnlocked(spec, state)) return { ok: false, reason: `${requestedTopic} isn't unlocked yet — a prerequisite isn't finished` };
  if (progressFor(state, requestedTopic).stage === 'exam_ready') return { ok: false, reason: `${requestedTopic} is already Exam Ready` };
  state.swappedIn[slot] = requestedTopic;
  return { ok: true, reason: null };
}

// ── C3: time split between the 2 active topics ──────────────────────────

export interface TimeSplit { priorityMinutes: number; secondaryMinutes: number }

// Hybrid: proportional to weightage, floored so the smaller topic is never
// token minutes (min 30% of the budget when both slots are filled).
export function splitTimeBudget(totalMinutes: number, priority: QaTopicSpec, secondary: QaTopicSpec | null): TimeSplit {
  if (!secondary) return { priorityMinutes: totalMinutes, secondaryMinutes: 0 };
  const wSum = priority.weightage + secondary.weightage;
  const rawPriorityShare = wSum > 0 ? priority.weightage / wSum : 0.5;
  const priorityShare = Math.min(0.7, Math.max(0.3, rawPriorityShare));
  const priorityMinutes = Math.round(totalMinutes * priorityShare);
  return { priorityMinutes, secondaryMinutes: totalMinutes - priorityMinutes };
}

// ── B3: how many sessions fit today's minutes, at the topic's current stage ─

export interface TopicSessionPlan {
  topic: string; stage: QaStage; sessionsToday: number; minutesUsed: number;
  sessionsRemainingAtStage: number; // after today, if all sessionsToday complete
}

export function sessionsForBudget(state: QaStudentState, spec: QaTopicSpec, minutesAvailable: number): TopicSessionPlan {
  const progress = progressFor(state, spec.topic);
  const stage = progress.stage;
  const perSession = SESSION_MINUTES[stage];
  const prescribed = stage === 'exam_ready' ? 0 : spec.sessions[stage];
  const remainingAtStage = Math.max(0, prescribed - progress.sessionsDoneAtStage);
  const sessionsToday = Math.max(0, Math.min(remainingAtStage, Math.floor(minutesAvailable / perSession)));
  return {
    topic: spec.topic, stage, sessionsToday, minutesUsed: sessionsToday * perSession,
    sessionsRemainingAtStage: remainingAtStage - sessionsToday,
  };
}

// ── B3/C4: advancing a stage — sessions done AND the tap, self-reported ────

export interface AdvanceResult { newStage: QaStage; stageCleared: boolean }

// `gotIt` is the student's own tap ("I've got this" vs "need more") — the
// ONLY gate on Exam Ready (C4). Sessions-done is necessary but not
// sufficient: it can't advance the stage without the tap, and the tap can't
// advance it before the prescribed sessions are actually done (Section B3).
export function advanceIfReady(state: QaStudentState, spec: QaTopicSpec, sessionsJustDone: number, gotIt: boolean): AdvanceResult {
  const progress = progressFor(state, spec.topic);
  const stage = progress.stage;
  const prescribed = stage === 'exam_ready' ? 0 : spec.sessions[stage];
  const doneNow = progress.sessionsDoneAtStage + sessionsJustDone;

  if (stage !== 'exam_ready' && doneNow >= prescribed && gotIt) {
    const idx = QA_STAGE_ORDER.indexOf(stage);
    const newStage = QA_STAGE_ORDER[idx + 1] ?? 'exam_ready';
    state.progressByTopic.set(spec.topic, { ...progress, stage: newStage, sessionsDoneAtStage: 0, lastTouchedDaysAgo: 0 });
    return { newStage, stageCleared: true };
  }
  state.progressByTopic.set(spec.topic, { ...progress, sessionsDoneAtStage: Math.min(doneNow, prescribed), lastTouchedDaysAgo: 0 });
  return { newStage: stage, stageCleared: false };
}

// ── C6: revision — short, additive, never competing for the main slot ─────

// Revision frequency is derived from the topic's OWN retention-difficulty
// score (a founder-supplied prior, LID) — higher retention-difficulty decays
// faster, so it comes back sooner. `misses` (Section D3: "went cold" taps)
// tighten the cycle further for THIS student — the plan learns that this
// person forgets this topic fast. Clamped to a sane 2-10 day range.
export function revisionFrequencyDays(spec: QaTopicSpec, misses = 0): number {
  const base = Math.round(12 - spec.difficulty.retention);
  return Math.min(10, Math.max(2, base - misses));
}

export interface RevisionTask { topic: string; reason: string }

// Scans every EXAM_READY core+opted-in-bonus topic for two triggers:
//  1. Still inside its initial post-mastery consolidation burst
//     (initialRevisionSessionsDone < spec.initialRevisionSessions).
//  2. Gone cold — lastTouchedDaysAgo exceeds this topic's own decay window.
// Returns at most ONE revision task (C6: it's additive, never a second main
// slot) — the most overdue wins.
export function dueRevision(state: QaStudentState): RevisionTask | null {
  const pool = eligiblePool(state).filter((t) => progressFor(state, t.topic).stage === 'exam_ready');
  let best: { topic: string; reason: string; urgency: number } | null = null;

  for (const spec of pool) {
    const progress = progressFor(state, spec.topic);
    if (progress.initialRevisionSessionsDone < spec.initialRevisionSessions) {
      const urgency = 1000; // consolidation always wins — it's brand new mastery
      if (!best || urgency > best.urgency) best = { topic: spec.topic, reason: 'Just mastered — lock it in', urgency };
      continue;
    }
    // D4: a topic the last mock exposed jumps the decay queue — a real
    // exam-condition miss beats any calendar timer.
    if (progress.mockFlaggedForRevision) {
      const urgency = 900;
      if (!best || urgency > best.urgency) best = { topic: spec.topic, reason: 'Slipped in your last mock — shore it up', urgency };
      continue;
    }
    const freq = revisionFrequencyDays(spec, progress.revisionMisses);
    const daysSince = progress.lastTouchedDaysAgo ?? freq + 1;
    if (daysSince >= freq) {
      const urgency = daysSince - freq;
      if (!best || urgency > best.urgency) best = { topic: spec.topic, reason: `Untouched ${daysSince} days — going cold`, urgency };
    }
  }
  return best ? { topic: best.topic, reason: best.reason } : null;
}

// ── Task copy — "Level Up" framing, consistent with the rest of the product ─

export function stageLabel(stage: QaStage): string {
  return { concept: 'Concept', easy: 'Easy', medium: 'Medium', hard: 'Hard', exam_ready: 'Exam Ready' }[stage];
}

export function taskCopy(spec: QaTopicSpec, plan: TopicSessionPlan): string {
  if (plan.sessionsToday === 0) return `${spec.topic} — no time left today`;
  const label = stageLabel(plan.stage);
  const nextIdx = QA_STAGE_ORDER.indexOf(plan.stage) + 1;
  const next = QA_STAGE_ORDER[nextIdx];
  const tail = plan.sessionsRemainingAtStage === 0 && next ? ` · clears to ${stageLabel(next)} today` : plan.sessionsRemainingAtStage === 0 ? ' · Exam Ready today' : ` · ${plan.sessionsRemainingAtStage} session${plan.sessionsRemainingAtStage === 1 ? '' : 's'} left after today`;
  return `${spec.topic} · ${label} — ${plan.sessionsToday} session${plan.sessionsToday === 1 ? '' : 's'} (${plan.minutesUsed} min)${tail}`;
}

// ── Section D: the daily log — what a student taps, and how it moves state ──
//
// Deliberately minimal (founder, 22 Jul):
//   D1 study session  — ONE tap: "Got it" / "Need more". That's it.
//   D2 error type     — one OPTIONAL tap, shown only after "Need more":
//                       "didn't get the concept" vs "calculation slip".
//   D3 revision       — a LIGHTER tap: "still fresh" / "went cold" (not the
//                       full Got-it/Need-more — revision is quick).
//   D4 mock write-back — a topic that flopped in the weekly mock auto-flags
//                       for revision, jumping the decay queue.

export interface StudySessionLog {
  sessionsDone: number;      // how many of today's prescribed sessions they actually did
  gotIt: boolean;            // D1 — the one tap
  errorType?: ErrorType;     // D2 — only meaningful when gotIt === false
}

// D1 + D2: apply a day's study on one topic. Records the struggle signal first
// (so it survives), then runs the stage-advance gate (sessions-done AND the
// tap). Returns whether the stage cleared, for the "→ Easy unlocked" moment.
export function applyStudySession(state: QaStudentState, spec: QaTopicSpec, log: StudySessionLog): AdvanceResult {
  if (!log.gotIt && log.errorType) {
    const p = progressFor(state, spec.topic);
    state.progressByTopic.set(spec.topic, {
      ...p,
      conceptStruggles: p.conceptStruggles + (log.errorType === 'concept' ? 1 : 0),
      calcStruggles: p.calcStruggles + (log.errorType === 'calculation' ? 1 : 0),
    });
  }
  return advanceIfReady(state, spec, log.sessionsDone, log.gotIt);
}

// D3: a revision session. "still fresh" just resets the decay clock. "went
// cold" means they'd genuinely forgotten it — record a miss so THIS student's
// cycle for THIS topic tightens (revisionFrequencyDays), and keep it in the
// consolidation burst if it was still there. Either way the topic was touched,
// so the clock resets and any mock flag is cleared (they've now addressed it).
export function applyRevisionSession(state: QaStudentState, spec: QaTopicSpec, wentCold: boolean): void {
  const p = progressFor(state, spec.topic);
  const inConsolidation = p.initialRevisionSessionsDone < spec.initialRevisionSessions;
  state.progressByTopic.set(spec.topic, {
    ...p,
    initialRevisionSessionsDone: inConsolidation ? p.initialRevisionSessionsDone + 1 : p.initialRevisionSessionsDone,
    revisionMisses: wentCold ? p.revisionMisses + 1 : p.revisionMisses,
    lastTouchedDaysAgo: 0,
    mockFlaggedForRevision: false,
  });
}

// D4: fold a weekly mock's per-topic results back into the ladder. Only flags
// topics that are ALREADY exam_ready — a topic still being learned doesn't need
// a mock to tell it it isn't done. A flagged topic surfaces in dueRevision()
// ahead of the calendar (see urgency 900 there).
export interface MockTopicResult { topic: string; performedPoorly: boolean }

export function applyMockResults(state: QaStudentState, results: MockTopicResult[]): string[] {
  const flagged: string[] = [];
  for (const r of results) {
    if (!r.performedPoorly) continue;
    const p = progressFor(state, r.topic);
    if (p.stage === 'exam_ready') {
      state.progressByTopic.set(r.topic, { ...p, mockFlaggedForRevision: true });
      flagged.push(r.topic);
    }
  }
  return flagged;
}

// The dominant struggle signal for a topic, for the coach/behaviour read
// (null until there's a clear lean). "You slip on calculation here, not concept."
export function dominantStruggle(state: QaStudentState, topic: string): ErrorType | null {
  const p = progressFor(state, topic);
  if (p.conceptStruggles === p.calcStruggles) return null;
  return p.conceptStruggles > p.calcStruggles ? 'concept' : 'calculation';
}

// ── API helpers ─────────────────────────────────────────────────────────

// Topics the student could swap TO right now: unlocked, not yet mastered,
// excluding whatever's already on today's plan — ranked ROI-first.
export function swapCandidates(state: QaStudentState, excludeTopics: string[]): QaTopicSpec[] {
  const ex = new Set(excludeTopics);
  return selectablePool(state).filter((t) => !ex.has(t.topic)).sort((a, b) => topicRoi(b) - topicRoi(a));
}

// Core-syllabus progress, for the header ("18 / 33 topics Exam Ready").
export function coreProgress(state: QaStudentState): { mastered: number; total: number } {
  const total = QA_CORE_TOPICS.length;
  const mastered = QA_CORE_TOPICS.filter((t) => progressFor(state, t.topic).stage === 'exam_ready').length;
  return { mastered, total };
}
