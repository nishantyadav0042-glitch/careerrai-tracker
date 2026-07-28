// The Study Companion cadence — the founder's Inshorts insight made real:
// the notification tray becomes a study surface. Seven daily touches, five
// after 5pm (when CAT students actually study), and every push must pass
// the gift-vs-demand test: it delivers value readable in the tray, from
// THIS student's own data or real exam craft — never an invented statistic,
// never a sell, and only ONE demand per day (the 21:30 log reminder).
//
// Slots (IST): 09:30 plan · 13:00 micro-tip · 17:00 study window ·
// [20:00 decision-engine — already live, the smart-insight slot] ·
// 20:30 progress · 21:30 log reminder · 22:00 close.
//
// State gating (see notification-os): only students who CAN study today get
// the cadence — active loggers and Day 1-7 arc students. Slipping/inactive
// students stay on the recovery ladder; sending seven gifts to someone five
// days silent is noise, not help. The per-student cooldown stays on: an
// active logger never trips it, a student who stops logging AND stops
// tapping gets automatically quieter. Measurement decides the rest —
// every slot is a distinct type on /admin/notification-health.

import type { ExpectedAction } from './notification-os';

export type CompanionSlot = 'kickoff' | 'morning' | 'spark' | 'fact' | 'open' | 'wind' | 'progress' | 'log' | 'close';

export const COMPANION_SLOTS: readonly CompanionSlot[] = ['kickoff', 'morning', 'spark', 'fact', 'open', 'wind', 'progress', 'log', 'close'];

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
    title: `Today: ${weakest} leads`,
    body: `~${hoursToday}h planned. Your routine is built — first task is waiting.`,
    expectedAction: 'log_today',
  };
}

export function factCopy(tip: string): SlotCopy {
  return { title: 'One for the tray', body: tip, expectedAction: 'open_plan' };
}

export function openCopy(weakTopic: string | null, weakest: string, hoursToday: number): SlotCopy {
  return {
    title: 'Study window opens',
    body: weakTopic
      ? `${weakTopic} first — your ${hoursToday}h window starts now.`
      : `${weakest} first — your ${hoursToday}h window starts now.`,
    expectedAction: 'log_today',
  };
}

export function progressCopy(daysStudied: number, windowDays: number): SlotCopy {
  return {
    title: `${daysStudied} of last ${windowDays} days studied`,
    body: 'Tonight keeps the run.',
    expectedAction: 'open_plan',
  };
}

export function logCopy(dreamCollege: string): SlotCopy {
  return {
    title: '5 seconds, one step closer',
    body: `A quick update tonight keeps you moving toward ${dreamCollege}. Close the day right.`,
    expectedAction: 'log_today',
  };
}

export function closeCopy(streak: number, weakest: string): SlotCopy {
  return {
    title: streak > 1 ? `Done. ${streak}-day run.` : 'Done. Day closed.',
    body: `Tomorrow: ${weakest} first. Good night.`,
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
export function planMorningCopy(firstName: string, firstTopic: string, secondTopic: string | null, blocks: number, estHours: number): SlotCopy {
  const hrs = estHours >= 1 ? `~${estHours}h` : '';
  return {
    title: `${firstName}, today: ${firstTopic}`,
    body: secondTopic
      ? `Start with ${firstTopic}, then ${secondTopic}${blocks > 2 ? ` (+${blocks - 2} more)` : ''}. ${hrs} planned — tap to begin →`
      : `${firstTopic} is today's focus.${hrs ? ` ${hrs} planned.` : ''} Tap to begin →`,
    expectedAction: 'log_today',
  };
}

// 17:00 — study window opens, on the first not-yet-done topic with its target.
export function planOpenCopy(nextTopic: string, target: string | null, hoursToday: number): SlotCopy {
  return {
    title: 'Study window’s open',
    body: target
      ? `${nextTopic} — ${target}. Your ${hoursToday}h starts now.`
      : `${nextTopic} first — your ${hoursToday}h window starts now.`,
    expectedAction: 'log_today',
  };
}

// 20:30 — progress-aware. "Geometry done ✓ — RC is next." Only sent when at
// least one block is ticked and one remains, so it's always true encouragement.
export function planProgressCopy(doneCount: number, totalCount: number, nextTopic: string): SlotCopy {
  return {
    title: `${doneCount} of ${totalCount} done ✓`,
    body: `${nextTopic} is next — finish the set and update today's study →`,
    expectedAction: 'log_today',
  };
}

// 21:30 — the one demand, but concrete. "One block left: RC." If everything's
// already done, it's a pure log nudge; otherwise it names the remaining topic.
export function planLogCopy(nextTopic: string | null, dreamCollege: string): SlotCopy {
  return nextTopic
    ? { title: `One block left: ${nextTopic}`, body: `Finish it, update today's study, done. ${dreamCollege} gets a little closer.`, expectedAction: 'log_today' }
    : { title: 'Plan done — just update it', body: `You cleared today's plan. 5 seconds to update it and lock the streak.`, expectedAction: 'log_today' };
}

// 08:00 — a warm start to the day. Streak when there's a run to protect;
// otherwise a clean fresh-day line. A gift, never a demand.
export function kickoffCopy(streak: number, weakest: string, dreamCollege: string): SlotCopy {
  return streak > 1
    ? { title: `🔥 ${streak}-day run`, body: `One focused ${weakest} block today keeps it alive — and ${dreamCollege} closer.`, expectedAction: 'open_plan' }
    : { title: 'A fresh day toward your goal', body: `Your plan's ready — a few minutes on ${weakest} while you're sharp moves you toward ${dreamCollege}.`, expectedAction: 'open_plan' };
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
    title: "Today's plan is waiting on one answer",
    body: `How did ${yesterdayLabel} go? Fifteen seconds, and today rebuilds around it — ${weakest} is queued either way.`,
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
// gates), framed as "small beats zero", never guilt.
export function windCopy(weakest: string): SlotCopy {
  return {
    title: 'Evening block',
    body: `30 focused minutes on ${weakest} beats a perfect plan you skip.`,
    expectedAction: 'log_today',
  };
}

// ── Growth cadence: emotional activation / reactivation ─────────────────────
// The push channel's real job is pulling in students who AREN'T using the app —
// signups who never logged, and dormant ones. Urgency is real (their own
// inaction + the countdown to CAT); no invented statistics, no shaming. One
// angle per slot so up to 8/day never repeats.
// ── Aphorism hooks (Cal-AI style) ───────────────────────────────────────────
// A familiar phrase, twisted to point at the ONE action (the 5-second log).
// Witty, zero guilt, no invented stats. Rotated against the emotional
// dream-college lines so the tray never feels repetitive.
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
      return { title: 'The gap is still closeable', body: `You've done it before. Update today's study and your path to ${c.dreamCollege} restarts.`, expectedAction: 'log_today' };
    case 'log':
      return { title: "Update today's study", body: `90 seconds to break the silence. Tomorrow-you will be glad you did.`, expectedAction: 'log_today' };
    case 'close':
      return null;
  }
}

// The weakest-section rule lives in section-weakness.ts now — this module
// used to carry its own copy "because cron code must not import from a route
// module", which was the right constraint and the wrong fix. Re-exported so
// existing callers keep working.
export { weakestFromCoverage } from '@/lib/section-weakness';
