// Mastery Engine — the SECTION-AGNOSTIC core that turns any section's topic
// graph (QA, DILR, VARC…) into today's plan. Deterministic, no LLM. The QA
// engine's exact logic (Sections C+D), lifted to a factory so every section
// runs one engine instead of forking three.
//
//   createMasteryEngine(graph) → { pickActiveTopics, applyStudySession, … }
//
// Each section builds a SectionGraph from its topic-graph file and binds the
// engine to it (see qa-mastery-engine.ts / dilr-mastery-engine.ts). The
// per-section files keep the SAME exported function names, so callers (API
// routes, UI) never change when a new section is added.

export type Stage = 'concept' | 'easy' | 'medium' | 'hard' | 'exam_ready';

// Session length (Section A1) — stage-specific, not flat. Concept is new
// learning (shorter); practice sustains longer.
export const SESSION_MINUTES: Record<Stage, number> = { concept: 25, easy: 40, medium: 40, hard: 40, exam_ready: 40 };
export const REVISION_SESSION_MINUTES = 20;

// The minimum shape every section's topic spec must satisfy. `cluster` is a
// plain string here (each section narrows it to its own union).
export interface MasteryTopicSpec {
  topic: string;
  cluster: string;
  isBonus: boolean;
  prerequisites: string[];
  weightage: number;
  difficulty: { concept: number; practice: number; retention: number; exam: number };
  sessions: { concept: number; easy: number; medium: number; hard: number };
  initialRevisionSessions: number;
}

export interface SectionGraph<T extends MasteryTopicSpec> {
  topics: T[];
  byName: Map<string, T>;
  coreTopics: T[];
  clusters: string[];
  stageOrder: Stage[];
  defaultCluster: string; // deterministic weakest-cluster tie-break
}

export type ErrorType = 'concept' | 'calculation';

export interface StudentTopicProgress {
  topic: string;
  stage: Stage;
  sessionsDoneAtStage: number;
  initialRevisionSessionsDone: number;
  lastTouchedDaysAgo: number | null;
  conceptStruggles: number;
  calcStruggles: number;
  revisionMisses: number;
  mockFlaggedForRevision: boolean;
}

export interface MasteryStudentState {
  includeBonus: boolean;
  progressByTopic: Map<string, StudentTopicProgress>;
  swappedIn: Partial<Record<'priority' | 'secondary', string>>;
}

export interface ActiveTopicSelection<T> { priority: T; secondary: T | null; reasons: { priority: string; secondary: string | null } }
export interface SwapResult { ok: boolean; reason: string | null }
export interface TimeSplit { priorityMinutes: number; secondaryMinutes: number }
export interface TopicSessionPlan { topic: string; stage: Stage; sessionsToday: number; minutesUsed: number; sessionsRemainingAtStage: number }
export interface AdvanceResult { newStage: Stage; stageCleared: boolean }
export interface RevisionTask { topic: string; reason: string }
export interface StudySessionLog { sessionsDone: number; gotIt: boolean; errorType?: ErrorType }
export interface MockTopicResult { topic: string; performedPoorly: boolean }

export function stageLabel(stage: Stage): string {
  return { concept: 'Concept', easy: 'Easy', medium: 'Medium', hard: 'Hard', exam_ready: 'Exam Ready' }[stage];
}

export function createMasteryEngine<T extends MasteryTopicSpec>(graph: SectionGraph<T>) {
  const { byName, topics, coreTopics, clusters, stageOrder, defaultCluster } = graph;

  function progressFor(state: MasteryStudentState, topic: string): StudentTopicProgress {
    return state.progressByTopic.get(topic) ?? {
      topic, stage: 'concept', sessionsDoneAtStage: 0, initialRevisionSessionsDone: 0, lastTouchedDaysAgo: null,
      conceptStruggles: 0, calcStruggles: 0, revisionMisses: 0, mockFlaggedForRevision: false,
    };
  }

  // C1: ROI — marks value per unit effort (a defensible prior, calibrate later).
  function topicRoi(spec: T): number {
    const total = spec.sessions.concept + spec.sessions.easy + spec.sessions.medium + spec.sessions.hard;
    return total > 0 ? spec.weightage / total : 0;
  }

  function isUnlocked(spec: T, state: MasteryStudentState): boolean {
    return spec.prerequisites.every((p) => progressFor(state, p).stage === 'exam_ready');
  }

  function allCoreExamReady(state: MasteryStudentState): boolean {
    return coreTopics.every((t) => progressFor(state, t.topic).stage === 'exam_ready');
  }

  // C5: eligible = core always; bonus only if opted in OR all core mastered.
  function eligiblePool(state: MasteryStudentState): T[] {
    const bonusOpen = state.includeBonus || allCoreExamReady(state);
    return topics.filter((t) => !t.isBonus || bonusOpen);
  }

  function selectablePool(state: MasteryStudentState): T[] {
    return eligiblePool(state).filter((t) => isUnlocked(t, state) && progressFor(state, t.topic).stage !== 'exam_ready');
  }

  function bestInPool(pool: T[], exclude: Set<string>): T | null {
    return pool.filter((t) => !exclude.has(t.topic)).sort((a, b) => topicRoi(b) - topicRoi(a))[0] ?? null;
  }

  // C2: weakest cluster = highest share of topics still below exam_ready.
  function weakestCluster(state: MasteryStudentState): string {
    let best: { c: string; score: number } | null = null;
    for (const c of clusters) {
      const inCluster = coreTopics.filter((t) => t.cluster === c);
      if (inCluster.length === 0) continue;
      const unfinished = inCluster.filter((t) => progressFor(state, t.topic).stage !== 'exam_ready').length;
      const score = unfinished / inCluster.length;
      if (best == null || score > best.score) best = { c, score };
    }
    return best?.c ?? defaultCluster;
  }

  function pickActiveTopics(state: MasteryStudentState): ActiveTopicSelection<T> {
    const pool = selectablePool(state);
    const weak = weakestCluster(state);

    const swappedPriority = state.swappedIn.priority ? byName.get(state.swappedIn.priority) : undefined;
    const swappedSecondary = state.swappedIn.secondary ? byName.get(state.swappedIn.secondary) : undefined;
    const priorityValid = swappedPriority && pool.includes(swappedPriority);
    const secondaryValid = swappedSecondary && pool.includes(swappedSecondary);

    const weakPool = pool.filter((t) => t.cluster === weak);
    const priority = priorityValid ? swappedPriority! : (bestInPool(weakPool, new Set()) ?? bestInPool(pool, new Set()));
    if (!priority) throw new Error('No selectable topic — all unlocked topics are exam_ready');

    const otherPool = pool.filter((t) => t.cluster !== priority.cluster);
    // Never surface the same topic in both slots. A swapped-in secondary can
    // collide with the priority when the priority later shifts onto that same
    // topic (e.g. the student masters the original priority, and the weakest-
    // cluster pick lands on the topic they'd swapped into the secondary slot).
    // Only honour the swapped secondary when it differs from the priority;
    // otherwise fall back to the best other-cluster topic that isn't priority.
    const honorSwappedSecondary = secondaryValid && swappedSecondary!.topic !== priority.topic;
    const secondary = honorSwappedSecondary ? swappedSecondary! : bestInPool(otherPool, new Set([priority.topic]));

    return {
      priority, secondary,
      reasons: {
        // Only claim "weakest cluster" when the priority actually came from it —
        // if the weakest cluster was fully prereq-locked, the priority is the
        // best topic the student can start now, from another cluster.
        priority: priorityValid ? 'You picked this'
          : priority.cluster === weak ? `${weak} is your weakest area right now`
          : `The best topic to start right now`,
        secondary: secondary ? (honorSwappedSecondary ? 'You picked this' : `A strong topic from another area, for a change`) : null,
      },
    };
  }

  function swapTopic(state: MasteryStudentState, slot: 'priority' | 'secondary', requestedTopic: string): SwapResult {
    const spec = byName.get(requestedTopic);
    if (!spec) return { ok: false, reason: 'Unknown topic' };
    if (!isUnlocked(spec, state)) return { ok: false, reason: `${requestedTopic} isn't unlocked yet — a prerequisite isn't finished` };
    if (progressFor(state, requestedTopic).stage === 'exam_ready') return { ok: false, reason: `${requestedTopic} is already Exam Ready` };
    state.swappedIn[slot] = requestedTopic;
    return { ok: true, reason: null };
  }

  // C3: hybrid + priority-leads (priority gets 50-75%; secondary never < 25%).
  function splitTimeBudget(totalMinutes: number, priority: T, secondary: T | null): TimeSplit {
    if (!secondary) return { priorityMinutes: totalMinutes, secondaryMinutes: 0 };
    const wSum = priority.weightage + secondary.weightage;
    const raw = wSum > 0 ? priority.weightage / wSum : 0.5;
    const share = Math.min(0.75, Math.max(0.5, raw));
    const priorityMinutes = Math.round(totalMinutes * share);
    return { priorityMinutes, secondaryMinutes: totalMinutes - priorityMinutes };
  }

  function sessionsForBudget(state: MasteryStudentState, spec: T, minutesAvailable: number): TopicSessionPlan {
    const progress = progressFor(state, spec.topic);
    const stage = progress.stage;
    if (stage === 'exam_ready') {
      return { topic: spec.topic, stage, sessionsToday: 0, minutesUsed: 0, sessionsRemainingAtStage: 0 };
    }
    const perSession = SESSION_MINUTES[stage];
    const prescribed = spec.sessions[stage];
    const remainingAtStage = Math.max(0, prescribed - progress.sessionsDoneAtStage);
    // A topic that made it onto today's plan is ALWAYS actionable — never a
    // "0 sessions (0 min)" dead card. Two guards:
    //  • at least 1 session even when the day's minute budget is tight (a small
    //    secondary slice could otherwise floor to 0); we trust the student to
    //    fit a short session.
    //  • at least 1 session even when all prescribed sessions are already done
    //    (remainingAtStage === 0, reachable by tapping "Need more" up to the
    //    cap): that one session is the "Got it" that clears the stage.
    const capacity = Math.max(1, Math.floor(minutesAvailable / perSession));
    const sessionsToday = Math.min(Math.max(1, remainingAtStage), capacity);
    return { topic: spec.topic, stage, sessionsToday, minutesUsed: sessionsToday * perSession, sessionsRemainingAtStage: Math.max(0, remainingAtStage - sessionsToday) };
  }

  // B3/C4: ONE "Got it" clears the current stage — we trust the student. Tapping
  // "Got it" means "I'm confident at this level", so it advances a stage on a
  // single tap (Concept→Easy→…→Exam Ready = 4 taps to master), each a visible
  // jump. The per-stage session counts are the RECOMMENDED study effort shown on
  // the card, not a tap-gate — requiring N taps to clear one stage read as a
  // broken button. "Need more" (gotIt=false) keeps the student on the stage and
  // records a practice session, which still feeds struggle signals + revision.
  function advanceIfReady(state: MasteryStudentState, spec: T, sessionsJustDone: number, gotIt: boolean): AdvanceResult {
    const progress = progressFor(state, spec.topic);
    const stage = progress.stage;
    if (stage !== 'exam_ready' && gotIt) {
      const newStage = stageOrder[stageOrder.indexOf(stage) + 1] ?? 'exam_ready';
      state.progressByTopic.set(spec.topic, { ...progress, stage: newStage, sessionsDoneAtStage: 0, lastTouchedDaysAgo: 0 });
      return { newStage, stageCleared: true };
    }
    const prescribed = stage === 'exam_ready' ? 0 : spec.sessions[stage];
    const doneNow = progress.sessionsDoneAtStage + Math.max(0, sessionsJustDone);
    state.progressByTopic.set(spec.topic, { ...progress, sessionsDoneAtStage: Math.min(doneNow, prescribed), lastTouchedDaysAgo: 0 });
    return { newStage: stage, stageCleared: false };
  }

  // C6: revision cadence from the topic's retention-difficulty, tightened per
  // student by "went cold" misses.
  function revisionFrequencyDays(spec: T, misses = 0): number {
    return Math.min(10, Math.max(2, Math.round(12 - spec.difficulty.retention) - misses));
  }

  function dueRevision(state: MasteryStudentState): RevisionTask | null {
    const pool = eligiblePool(state).filter((t) => progressFor(state, t.topic).stage === 'exam_ready');
    let best: { topic: string; reason: string; urgency: number } | null = null;
    for (const spec of pool) {
      const progress = progressFor(state, spec.topic);
      if (progress.initialRevisionSessionsDone < spec.initialRevisionSessions) {
        if (!best || 1000 > best.urgency) best = { topic: spec.topic, reason: 'Just mastered — lock it in', urgency: 1000 };
        continue;
      }
      if (progress.mockFlaggedForRevision) {
        if (!best || 900 > best.urgency) best = { topic: spec.topic, reason: 'Slipped in your last mock — shore it up', urgency: 900 };
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

  function taskCopy(spec: T, plan: TopicSessionPlan): string {
    if (plan.sessionsToday === 0) return `${spec.topic} — no time left today`;
    const next = stageOrder[stageOrder.indexOf(plan.stage) + 1];
    const tail = plan.sessionsRemainingAtStage === 0 && next ? ` · clears to ${stageLabel(next)} today`
      : plan.sessionsRemainingAtStage === 0 ? ' · Exam Ready today'
      : ` · ${plan.sessionsRemainingAtStage} session${plan.sessionsRemainingAtStage === 1 ? '' : 's'} left after today`;
    return `${spec.topic} · ${stageLabel(plan.stage)} — ${plan.sessionsToday} session${plan.sessionsToday === 1 ? '' : 's'} (${plan.minutesUsed} min)${tail}`;
  }

  // Section D log handlers.
  function applyStudySession(state: MasteryStudentState, spec: T, log: StudySessionLog): AdvanceResult {
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

  function applyRevisionSession(state: MasteryStudentState, spec: T, wentCold: boolean): void {
    const p = progressFor(state, spec.topic);
    const inConsolidation = p.initialRevisionSessionsDone < spec.initialRevisionSessions;
    state.progressByTopic.set(spec.topic, {
      ...p,
      initialRevisionSessionsDone: inConsolidation ? p.initialRevisionSessionsDone + 1 : p.initialRevisionSessionsDone,
      revisionMisses: wentCold ? p.revisionMisses + 1 : p.revisionMisses,
      lastTouchedDaysAgo: 0, mockFlaggedForRevision: false,
    });
  }

  function applyMockResults(state: MasteryStudentState, results: MockTopicResult[]): string[] {
    const flagged: string[] = [];
    for (const r of results) {
      if (!r.performedPoorly) continue;
      const p = progressFor(state, r.topic);
      if (p.stage === 'exam_ready') { state.progressByTopic.set(r.topic, { ...p, mockFlaggedForRevision: true }); flagged.push(r.topic); }
    }
    return flagged;
  }

  function dominantStruggle(state: MasteryStudentState, topic: string): ErrorType | null {
    const p = progressFor(state, topic);
    if (p.conceptStruggles === p.calcStruggles) return null;
    return p.conceptStruggles > p.calcStruggles ? 'concept' : 'calculation';
  }

  function swapCandidates(state: MasteryStudentState, excludeTopics: string[]): T[] {
    const ex = new Set(excludeTopics);
    return selectablePool(state).filter((t) => !ex.has(t.topic)).sort((a, b) => topicRoi(b) - topicRoi(a));
  }

  function coreProgress(state: MasteryStudentState): { mastered: number; total: number } {
    return { total: coreTopics.length, mastered: coreTopics.filter((t) => progressFor(state, t.topic).stage === 'exam_ready').length };
  }

  return {
    progressFor, topicRoi, isUnlocked, weakestCluster, pickActiveTopics, swapTopic, splitTimeBudget,
    sessionsForBudget, advanceIfReady, revisionFrequencyDays, dueRevision, taskCopy,
    applyStudySession, applyRevisionSession, applyMockResults, dominantStruggle, swapCandidates, coreProgress,
  };
}
