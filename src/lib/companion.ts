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
    body: `A quick log tonight keeps you moving toward ${dreamCollege}. Close the day right.`,
    expectedAction: 'log_today',
  };
}

export function closeCopy(streak: number, weakest: string): SlotCopy {
  return {
    title: streak > 1 ? `Logged. ${streak}-day run.` : 'Logged. Day closed.',
    body: `Tomorrow: ${weakest} first. Good night.`,
    expectedAction: 'open_plan',
  };
}

// 08:00 — a warm start to the day. Streak when there's a run to protect;
// otherwise a clean fresh-day line. A gift, never a demand.
export function kickoffCopy(streak: number, weakest: string, dreamCollege: string): SlotCopy {
  return streak > 1
    ? { title: `🔥 ${streak}-day run`, body: `One focused ${weakest} block today keeps it alive — and ${dreamCollege} closer.`, expectedAction: 'open_plan' }
    : { title: 'A fresh day toward your goal', body: `Your plan's ready — a few minutes on ${weakest} while you're sharp moves you toward ${dreamCollege}.`, expectedAction: 'open_plan' };
}

// 11:00 — the "study smart" strategy gift (section-agnostic craft).
export function sparkCopy(dayOfYear: number): SlotCopy {
  return { title: 'Study smart', body: companionStrategy(dayOfYear), expectedAction: 'open_plan' };
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
export interface ActivationCtx { firstName: string; daysToExam: number; rotate: number; weakest: string; dreamCollege: string }

// plan_ready — onboarded, never logged. Pull them to START. Vibe (founder,
// modelled on Cal AI's "a few pictures a day → your dream body"): tiny daily
// effort → the student's OWN dream college. Aspirational but honest — the
// countdown and their inaction are real; the dream (and its name) are theirs.
export function activationSlotCopy(slot: CompanionSlot, c: ActivationCtx): SlotCopy | null {
  switch (slot) {
    case 'kickoff':
      return { title: `${c.daysToExam} days to ${c.dreamCollege}`, body: `${c.firstName}, it starts with one 5-second log. Your plan is built — take the first step today.`, expectedAction: 'log_today' };
    case 'morning':
      return { title: 'Your journey starts today', body: `All it takes is a few focused minutes a day toward ${c.dreamCollege}. Your plan is ready — open the first task and go.`, expectedAction: 'log_today' };
    case 'spark':
      return { title: 'Every IIM topper began at day one', body: companionStrategy(c.rotate), expectedAction: 'open_plan' };
    case 'fact':
      return { title: 'A few minutes a day', body: `That's all it takes to close the gap to ${c.dreamCollege}. Your plan knows the first step — open it.`, expectedAction: 'open_plan' };
    case 'open':
      return { title: 'Your study window is open', body: `${c.weakest} first — a few focused minutes now moves you toward ${c.dreamCollege}.`, expectedAction: 'log_today' };
    case 'wind':
      return { title: `${c.daysToExam} days left — start tonight`, body: `A dream like ${c.dreamCollege} is built one small day at a time. 30 focused minutes tonight beats a perfect plan you never open.`, expectedAction: 'log_today' };
    case 'progress':
      return { title: `Still 0 logged · ${c.daysToExam} days to go`, body: `Every single day counts toward ${c.dreamCollege}. One 5-second log tonight starts it.`, expectedAction: 'log_today' };
    case 'log':
      return { title: `5 seconds to ${c.dreamCollege}`, body: `One quick log tonight starts your streak — and the journey there. Do it now.`, expectedAction: 'log_today' };
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
      return { title: 'One for the tray', body: `Your plan is still here, still yours. Open it and take one step.`, expectedAction: 'open_plan' };
    case 'open':
      return { title: 'Restart small', body: `${c.weakest}, 20 minutes. Small beats zero — and zero is how gaps grow.`, expectedAction: 'log_today' };
    case 'wind':
      return { title: `${c.daysToExam} days to CAT`, body: `The clock doesn't pause for a break. One block tonight and you're moving toward ${c.dreamCollege} again.`, expectedAction: 'log_today' };
    case 'progress':
      return { title: 'The gap is still closeable', body: `You've done it before. Log tonight and your path to ${c.dreamCollege} restarts.`, expectedAction: 'log_today' };
    case 'log':
      return { title: 'Log tonight', body: `90 seconds to break the silence. Tomorrow-you will be glad you did.`, expectedAction: 'log_today' };
    case 'close':
      return null;
  }
}

// Same rule the routine engine's weakest-derivation uses (see
// /api/routine/today computeWeakestFromCoverage): most ground left to
// cover, untouched topics weighted double, ratio-based across sections,
// ties break DILR → QA → VARC. Duplicated here as a small pure function
// because cron code must not import from a route module.
export function weakestFromCoverage(rows: { section: string; status: string }[]): 'VARC' | 'DILR' | 'QA' | null {
  if (rows.length === 0) return null;
  const tieOrder: ('VARC' | 'DILR' | 'QA')[] = ['DILR', 'QA', 'VARC'];
  let best: { s: 'VARC' | 'DILR' | 'QA'; score: number } | null = null;
  for (const s of tieOrder) {
    const sectionRows = rows.filter((r) => r.section === s);
    if (sectionRows.length === 0) continue;
    const gap = sectionRows.reduce((sum, r) => sum + (r.status === 'not_started' ? 2 : r.status === 'learning' ? 1 : 0), 0);
    const score = gap / sectionRows.length;
    if (best == null || score > best.score) best = { s, score };
  }
  return best?.s ?? null;
}
