// The Study Companion cadence — the founder's Inshorts insight made real:
// the notification tray becomes a study surface. Every push must pass the
// gift-vs-demand test: it delivers value readable in the tray, from THIS
// student's own data or real exam craft — never an invented statistic,
// never a sell, and only ONE demand per day (the 21:30 log reminder).
//
// THE CANONICAL SCHEDULE IS vercel.json. Four slots run (IST):
//   08:00 kickoff · 11:00 spark · 20:30 progress · 21:30 log
// plus 20:00 decision-engine, which is a separate job, not a slot here.
//
// Four, not nine, because BUDGET_ACTIVE = 4 (notification-os): an engaged
// logger may receive four student-budget notifications a day. A fifth slot
// would be built, dispatched, and then refused as `budget_exhausted` — work
// that produces silence. The cadence is sized to the budget on purpose.
//
// The other five slots ran in production 13–27 July 2026 and were retired
// on 27 July; see RETIRED_COMPANION_SLOTS below. Their copy is kept (it is
// good, and a future budget could earn it back) but the route refuses them,
// so "has copy" can never again be mistaken for "is scheduled".
//
// State gating (see notification-os): only students who CAN study today get
// the cadence — active loggers and Day 1-7 arc students. Slipping/inactive
// students stay on the recovery ladder; sending a fistful of gifts to
// someone five days silent is noise, not help. The per-student cooldown stays on: an
// active logger never trips it, a student who stops logging AND stops
// tapping gets automatically quieter. Measurement decides the rest —
// every slot is a distinct type on /admin/notification-health.

import type { ExpectedAction } from './notification-os';

export type CompanionSlot = 'kickoff' | 'morning' | 'spark' | 'fact' | 'open' | 'wind' | 'progress' | 'log' | 'close';

export const COMPANION_SLOTS: readonly CompanionSlot[] = ['kickoff', 'morning', 'spark', 'fact', 'open', 'wind', 'progress', 'log', 'close'];

// ── Retired slots — proven, not assumed ─────────────────────────────────────
// These five carry copy and a `case` in the cron route but have no schedule
// in vercel.json and MUST NOT be run. The evidence they were retired rather
// than lost, read from production on 2 Sep 2026:
//
//   companion_morning  1,814 rows · 13 Jul → 27 Jul 09:32 · then nothing
//   companion_fact     1,943 rows · 13 Jul → 27 Jul 13:01 · then nothing
//   companion_open     1,952 rows · 13 Jul → 27 Jul 17:01 · then nothing
//   companion_wind     1,884 rows · 13 Jul → 27 Jul 18:31 · then nothing
//   companion_close       21 rows · 13 Jul → 25 Jul 22:00 · then nothing
//
// against the four that never stopped (kickoff 17,177 · spark 17,584 ·
// progress 17,359 · log 16,663, all still firing today). Five slots ending
// on one day while four continue is a decision, not a scheduler failure —
// and the count it lands on is exactly BUDGET_ACTIVE.
//
// This list plus vercel.json must together account for every slot, exactly
// once — enforced by companion-schedule.guard.test.ts. That guard is the
// reason a slot can no longer be quietly unscheduled: nothing else notices,
// because cron liveness alerting keys on the ROUTE, so the four live slots
// mask the absence of any fifth.
export const RETIRED_COMPANION_SLOTS: readonly CompanionSlot[] = ['morning', 'fact', 'open', 'wind', 'close'];

/** Slots that may actually be dispatched. The route refuses everything else. */
export function isRetiredSlot(slot: CompanionSlot): boolean {
  return RETIRED_COMPANION_SLOTS.includes(slot);
}

export function companionType(slot: CompanionSlot): string {
  return `companion_${slot}`;
}

// ── Micro-tip bank (13:00 slot) ─────────────────────────────────────────────
// Curated exam craft, one line, consumable in the tray. Real CAT wisdom —
// no invented numbers, no fabricated research. Personalized by the
// student's weakest section, rotated by day so two days never repeat.
const TIP_BANK: Record<'VARC' | 'DILR' | 'QA', string[]> = {
  VARC: [
    'RC is won by elimination — cross out two wrong options before hunting the right one.',
    "Read the question stem before the passage's second read. You'll know what to look for.",
    'In para-jumbles, find the opening sentence first — it has no backward reference.',
    "An RC option that's too extreme ('always', 'never', 'only') is usually the trap.",
  ],
  DILR: [
    'DILR sets are won at selection, not solving — spend the first minutes choosing, not attempting.',
    'If a set has no fixed anchor after 3 minutes of reading, leave it. Sunk time is the DILR killer.',
    'Draw the grid before reasoning. Structure on paper beats structure in your head.',
    'Count constraints before attempting: more constraints usually means an easier set, not harder.',
  ],
  QA: [
    'In QA, the answer options are part of the question — plug them in before solving algebraically.',
    'Skip on first hesitation, return later. One stubborn question costs three easy ones.',
    'Arithmetic carries QA — percentages, ratios, TSD deserve more revision than exotic topics.',
    'Estimate before you calculate. Half of QA options die to a rough bound.',
  ],
};

export function companionTip(weakest: 'VARC' | 'DILR' | 'QA', dayOfYear: number): string {
  const bank = TIP_BANK[weakest];
  return bank[dayOfYear % bank.length];
}

// ── Strategy / mindset bank (11:00 spark slot) ──────────────────────────────
// Section-agnostic exam craft — the "study smart" gift, distinct from the
// section micro-tip at 13:00. Real principles, no invented numbers.
const STRATEGY_TIPS: string[] = [
  'Consistency beats intensity — two focused hours daily outrun a weekend cram.',
  'Review every mock the same day you take it, while the mistakes are still fresh.',
  'Study your weakest section first, when your mind is sharpest.',
  'Untimed practice builds accuracy; timed practice builds temperament. You need both.',
  'A topic you can explain out loud is a topic you own.',
  'Sleep is a study tool — memory consolidates overnight, not during cramming.',
  'Accuracy before speed. Speed is what accuracy becomes once the method is automatic.',
];

export function companionStrategy(dayOfYear: number): string {
  return STRATEGY_TIPS[dayOfYear % STRATEGY_TIPS.length];
}

// ── Slot copy ───────────────────────────────────────────────────────────────
// Every claim in these templates must be TRUE from the inputs — hours from
// their own commitment, sections from their own grid, counts from their
// own logs. If an input is missing, the caller skips the slot (silence)
// rather than padding.

export interface SlotCopy { title: string; body: string; expectedAction: ExpectedAction }

export function morningCopy(weakest: string, hoursToday: number): SlotCopy {
  return {
    title: `Today's plan is ready`,
    body: `${weakest} leads. ~${hoursToday}h, already sorted.`,
    expectedAction: 'log_today',
  };
}

export function factCopy(tip: string): SlotCopy {
  return { title: 'One for the tray', body: tip, expectedAction: 'open_plan' };
}

export function openCopy(weakTopic: string | null, weakest: string, hoursToday: number): SlotCopy {
  return {
    title: `${weakTopic ?? weakest} is waiting`,
    body: `Everything else is handled. ${hoursToday}h whenever you start.`,
    expectedAction: 'log_today',
  };
}

export function progressCopy(daysStudied: number, windowDays: number): SlotCopy {
  return {
    title: `${daysStudied} of the last ${windowDays} days done`,
    body: "We're keeping count so you don't have to.",
    expectedAction: 'open_plan',
  };
}

export function logCopy(dreamCollege: string): SlotCopy {
  return {
    title: 'Only today is missing',
    body: `Ten seconds to tell us how it went, and tomorrow builds itself. ${dreamCollege} gets closer.`,
    expectedAction: 'log_today',
  };
}

export function closeCopy(streak: number, weakest: string): SlotCopy {
  return {
    title: streak > 1 ? `Day closed. ${streak} days safe.` : 'Day closed.',
    body: `Tomorrow is ready — ${weakest} first. Nothing for you to plan.`,
    expectedAction: 'open_plan',
  };
}

// ── Plan-aware copy (topic-level) ───────────────────────────────────────────
// The founder's ask: notifications should name today's ACTUAL topic and
// what's next ("Geometry today → RC next"), not just the weakest section or
// the dream college. These take the concrete topics/targets the Routine
// Engine chose (via computeTodaysPlan) — every word is true from the
// student's own generated plan. Callers use these when a plan exists and
// fall back to the section-level copy above when it doesn't.

// 09:30 — the day's plan preview, named. "Start with Geometry, then RC."
// The coaching student's morning line. It says something they can CHECK —
// their own class was on Percentages today — which is the difference between a
// reminder ("come back to the app") and a manager's update ("this is handled").
// Only sent when today's lead topic genuinely came from their timetable; if it
// did not, the ordinary plan copy is the honest one.
export function classMorningCopy(firstName: string, classTopic: string, estHours: number): SlotCopy {
  const hrs = estHours >= 1 ? ` ~${estHours}h` : '';
  return {
    title: `${firstName}, today follows your class`,
    body: `Your coaching does ${classTopic} today, so that leads your plan.${hrs} Already sorted.`,
    expectedAction: 'log_today',
  };
}

export function planMorningCopy(firstName: string, firstTopic: string, secondTopic: string | null, blocks: number, estHours: number): SlotCopy {
  const hrs = estHours >= 1 ? `~${estHours}h` : '';
  return {
    title: `${firstName}, today is ready`,
    body: secondTopic
      ? `${firstTopic}, then ${secondTopic}${blocks > 2 ? ` (+${blocks - 2} more)` : ''}.${hrs ? ` ${hrs}.` : ''} Already planned — just start.`
      : `${firstTopic}.${hrs ? ` ${hrs}.` : ''} Already planned — just start.`,
    expectedAction: 'log_today',
  };
}

/**
 * The ONE morning the concept-resource layer is announced by push.
 *
 * Date-bounded so it expires by itself. The last announcement in this codebase
 * kept shipping for eight days after the capability it described was deleted;
 * an expiry that a human has to remember to remove is the same bug waiting to
 * happen, so this one cannot outlive its day.
 *
 * The title is deliberately unchanged from planMorningCopy — that title is what
 * makes a student open the app, and the news is worth nothing if they do not.
 * The body carries the news instead, and stays the same length as the copy it
 * replaces so nothing gets truncated on the lock screen.
 */
// ── The lesson-link announcement, for exactly one morning ───────────────────
//
// The 09:30 `morning` slot is NOT scheduled in vercel.json — only kickoff,
// spark, progress and log are — so an announcement written into that slot
// would have shipped, passed every test, and reached nobody. It rides
// `kickoff` (08:00 IST) instead, which is the morning push students actually
// receive.
//
// This is not a reason to notify. It is laid over whatever decision the
// student's own cadence already made, so it creates no send: a student who
// was not going to get a kickoff push still gets nothing, the daily ceiling
// is untouched, and every cadence — activation, reactivation, active —
// carries the news rather than only the small active minority.
export const RESOURCE_ANNOUNCE_DAY = '2026-09-01';
export const RESOURCE_ANNOUNCE_SLOT: CompanionSlot = 'kickoff';

/**
 * `base` is the copy that cadence already chose. Its `expectedAction` is
 * preserved deliberately: the morning push's job is still to get the student
 * into their plan, and keeping it means this day's delivery, dedup and
 * attribution stay comparable to every other morning instead of becoming a
 * one-off nobody can read against the baseline.
 */
export function lessonLinkAnnounceCopy(base: SlotCopy, firstName: string): SlotCopy {
  return {
    title: `${firstName}, new topics now come with a lesson`,
    body: 'A topic you have not started yet now carries one free lesson link. Optional, and it changes nothing about your plan.',
    expectedAction: base.expectedAction,
  };
}

// 17:00 — study window opens, on the first not-yet-done topic with its target.
export function planOpenCopy(nextTopic: string, target: string | null, hoursToday: number): SlotCopy {
  return {
    title: `${nextTopic} is waiting`,
    body: target
      ? `${target}. Everything else is handled.`
      : `Everything else is handled — ${hoursToday}h whenever you start.`,
    expectedAction: 'log_today',
  };
}

// 20:30 — progress-aware. "Geometry done ✓ — RC is next." Only sent when at
// least one block is ticked and one remains, so it's always true encouragement.
export function planProgressCopy(doneCount: number, totalCount: number, nextTopic: string): SlotCopy {
  return {
    title: `${doneCount} of ${totalCount} done`,
    body: `${nextTopic} is the last one. We'll update everything after.`,
    expectedAction: 'log_today',
  };
}

// 21:30 — the ONE asking slot, and it stays (see the note above windCopy):
// the plan, the revision timing and the finish date are all computed FROM the
// log. A manager that never asks eventually manages nothing. Framed as the
// one thing only the student can do, never as a chase.
export function planLogCopy(nextTopic: string | null, dreamCollege: string): SlotCopy {
  return nextTopic
    ? { title: `Last one: ${nextTopic}`, body: `Finish it and we'll sort the rest. ${dreamCollege} gets closer.`, expectedAction: 'log_today' }
    : { title: 'Just one thing left for you', body: `Tell us how today went — ten seconds. We handle tomorrow.`, expectedAction: 'log_today' };
}

// 08:00 — a warm start. Reports what we've already done; the streak appears
// as a FACT that is safe, never as a threat ("don't break your streak" is
// banned — that line belongs to a teacher, not a manager).
export function kickoffCopy(streak: number, weakest: string, dreamCollege: string): SlotCopy {
  return streak > 1
    ? { title: `🔥 ${streak} days — and today's ready`, body: `${weakest} first. We planned it; you just study.`, expectedAction: 'open_plan' }
    : { title: 'Today is ready', body: `${weakest} first — planned around your time. One step toward ${dreamCollege}.`, expectedAction: 'open_plan' };
}

// 08:00 — STATE-TRIGGERED, not clock-triggered. Yesterday has no check-in, so
// today's plan is genuinely unfinished until the student answers one question.
// Notification OS §2.6: "a cron is a clock, not a reason." The clock only picks
// the moment; the missing check-in is the reason, and it is the only thing this
// slot has to say that is both specific and true.
//
// Our own outcome data is why this exists: state-triggered notifications
// outperform clock-triggered ones by 4-6x here (inactive_recovery 6.9% vs
// companion_kickoff 1.2%), and the generic kickoff produced 2 logs from 621
// sends. Same slot, same budget — a reason instead of a greeting.
//
// The claim must stay true: /api/routine/today really does recompute from this
// answer, and plan-reason.ts names what changed. If that ever stops being true,
// this copy has to change with it.
//
// No shame, ever. The student is not late and has not failed; one answer is
// simply outstanding. Never "you missed", "don't break", "you forgot".
export function missedCheckInKickoffCopy(yesterdayLabel: string, weakest: string): SlotCopy {
  return {
    title: 'One answer and today rebuilds',
    body: `How did ${yesterdayLabel} go? Fifteen seconds — ${weakest} is queued either way.`,
    expectedAction: 'log_today',
  };
}

// 11:00 — the "study smart" strategy gift (section-agnostic craft).
export function sparkCopy(dayOfYear: number): SlotCopy {
  // Alternate days: real exam craft vs a witty hook — variety beats blindness.
  return dayOfYear % 2 === 0
    ? { title: 'Study smart', body: companionStrategy(dayOfYear), expectedAction: 'open_plan' }
    : { title: 'Study smart', body: companionHook(dayOfYear), expectedAction: 'open_plan' };
}

// 18:30 — the evening nudge. Only sent when they haven't logged yet (caller
// gates). Offers the smallest honest version of the day instead of the whole
// plan: "plan too heavy" is the top product-caused blocker students filed
// themselves (churn cohort, 8 Aug).
export function windCopy(weakest: string): SlotCopy {
  return {
    title: 'Short version of today',
    body: `Just 30 minutes of ${weakest} counts. We'll adjust the rest.`,
    expectedAction: 'log_today',
  };
}

// ── "We already handled it" copy (founder, 8 Aug) ───────────────────────────
//
// The philosophy shift: a notification must never carry OUR goal ("come back
// to the app"). It carries the student's. The test every line below passes:
// remove the app entirely and the message is still worth receiving.
//
// Only two of the four categories the founder sketched are shippable today,
// and the other two are deliberately absent rather than faked:
//   ✅ "we already did something"  — the plan really is rebuilt nightly
//   ✅ "we protected you"          — shields and the weekly date move are real
//   ❌ "we noticed a pattern"      — needs behavioural data we do not have
//                                    (confidence is 92% untouched defaults)
//   ❌ "mock analysed, 3 changes"  — the cross-mock engine does not exist yet
// Each stays out until the thing behind it is true.


const HOOK_LINES: string[] = [
  'Time is money — a 5-second log is the cheapest investment in your rank.',
  "Toppers don't study more. They just never skip the log.",
  'A plan you can see beats a plan you remember.',
  'Consistency compounds — like interest, but for your percentile.',
  'The syllabus never sleeps. Luckily, a log takes 5 seconds.',
  "You can't improve what you don't track. Tracking takes 5 seconds.",
  'Small logs. Big ranks.',
];

export function companionHook(rotate: number): string {
  return HOOK_LINES[rotate % HOOK_LINES.length];
}

export interface ActivationCtx { firstName: string; daysToExam: number; rotate: number; weakest: string; dreamCollege: string }

// plan_ready — onboarded, never logged. Pull them to START. Vibe (founder,
// modelled on Cal AI's "a few pictures a day → your dream body"): tiny daily
// effort → the student's OWN dream college. Aspirational but honest — the
// countdown and their inaction are real; the dream (and its name) are theirs.
export function activationSlotCopy(slot: CompanionSlot, c: ActivationCtx): SlotCopy | null {
  switch (slot) {
    case 'kickoff':
      return { title: `${c.daysToExam} days to ${c.dreamCollege}`, body: `${c.firstName}, it starts with one 5-second update. Your plan is built — take the first step today.`, expectedAction: 'log_today' };
    case 'morning':
      return { title: 'Your journey starts today', body: `All it takes is a few focused minutes a day toward ${c.dreamCollege}. Your plan is ready — open the first task and go.`, expectedAction: 'log_today' };
    case 'spark':
      return { title: 'Every IIM topper began at day one', body: companionStrategy(c.rotate), expectedAction: 'open_plan' };
    case 'fact':
      // Rotate flavors: emotional (dream college) vs witty hook (Cal-AI style).
      return c.rotate % 2 === 0
        ? { title: 'A few minutes a day', body: `That's all it takes to close the gap to ${c.dreamCollege}. Your plan knows the first step — open it.`, expectedAction: 'open_plan' }
        : { title: 'One for the tray', body: companionHook(c.rotate), expectedAction: 'open_plan' };
    case 'open':
      return { title: 'Your study window is open', body: `${c.weakest} first — a few focused minutes now moves you toward ${c.dreamCollege}.`, expectedAction: 'log_today' };
    case 'wind':
      return { title: `${c.daysToExam} days left — start tonight`, body: `A dream like ${c.dreamCollege} is built one small day at a time. 30 focused minutes tonight beats a perfect plan you never open.`, expectedAction: 'log_today' };
    case 'progress':
      return { title: `Your first update starts it · ${c.daysToExam} days to CAT`, body: `Every single day counts toward ${c.dreamCollege}. One 5-second update tonight starts it.`, expectedAction: 'log_today' };
    case 'log':
      return { title: `5 seconds to ${c.dreamCollege}`, body: `One quick update tonight starts your streak — and the journey there. Do it now.`, expectedAction: 'log_today' };
    case 'close':
      return null; // nothing to celebrate until they log
  }
}

export interface ReactivationCtx { firstName: string; daysToExam: number; daysSinceLastLog: number; weakest: string; dreamCollege: string }

// slipping / inactive / dark — was logging, stopped. Pull them BACK, never shame.
export function reactivationSlotCopy(slot: CompanionSlot, c: ReactivationCtx): SlotCopy | null {
  switch (slot) {
    case 'kickoff':
      return { title: `${c.daysSinceLastLog} days since you studied`, body: `Momentum is hard to rebuild — but 10 minutes today restarts your climb to ${c.dreamCollege}.`, expectedAction: 'log_today' };
    case 'morning':
      return { title: 'Your plan reshaped for you', body: `It adjusted around the days you missed. Pick up where it now makes sense.`, expectedAction: 'open_plan' };
    case 'spark':
      return { title: 'Study smart', body: companionStrategy(c.daysSinceLastLog), expectedAction: 'open_plan' };
    case 'fact':
      return c.daysSinceLastLog % 2 === 0
        ? { title: 'One for the tray', body: `Your plan is still here, still yours. Open it and take one step.`, expectedAction: 'open_plan' }
        : { title: 'One for the tray', body: companionHook(c.daysSinceLastLog), expectedAction: 'open_plan' };
    case 'open':
      return { title: 'Restart small', body: `${c.weakest}, 20 minutes. Small beats zero — and zero is how gaps grow.`, expectedAction: 'log_today' };
    case 'wind':
      return { title: `${c.daysToExam} days to CAT`, body: `The clock doesn't pause for a break. One block tonight and you're moving toward ${c.dreamCollege} again.`, expectedAction: 'log_today' };
    case 'progress':
      return { title: 'The gap is still closeable', body: `You've done it before. Update topics studied today and your path to ${c.dreamCollege} restarts.`, expectedAction: 'log_today' };
    case 'log':
      return { title: "Update topics studied today", body: `90 seconds to break the silence. Tomorrow-you will be glad you did.`, expectedAction: 'log_today' };
    case 'close':
      return null;
  }
}

// The weakest-section rule lives in section-weakness.ts now — this module
// used to carry its own copy "because cron code must not import from a route
// module", which was the right constraint and the wrong fix. Re-exported so
// existing callers keep working.
export { weakestFromCoverage } from '@/lib/section-weakness';
