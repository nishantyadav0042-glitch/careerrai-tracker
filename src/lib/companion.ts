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

export function logCopy(): SlotCopy {
  return {
    title: "Today's log is open",
    body: '90 seconds. It closes the day properly.',
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
export function kickoffCopy(streak: number, weakest: string): SlotCopy {
  return streak > 1
    ? { title: `🔥 ${streak}-day run`, body: `One focused ${weakest} block today keeps it alive.`, expectedAction: 'open_plan' }
    : { title: 'Fresh day', body: `Your plan's ready — start with ${weakest} while you're sharp.`, expectedAction: 'open_plan' };
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
