// ── LOG BREAKERS AND DAILY LOGGERS: THE TOP OF THE COUNSELLOR'S DAY ──────────
//
// Founder, 24 Sep 2026, after 22 Sep settled at 11 real students logging
// against a normal ~19:
//
//   "Add log breakers as the first priority for Anshul. He has to connect
//    those first — those who are logging and broke their streak just 2-3 days
//    ago … log breakers call connect is mandatory. He has to try 2-3 times
//    until he connects."
//
//   "These students who are logging daily are extremely important for us …
//    get feedback from these: why they are logging daily, what they are
//    liking, what's the unique thing — or why someone is not logging: the
//    weakness, the missing feature, or some error."
//
// What the book looked like that day: every one of the seven students who had
// logged on 5+ of the last 7 days was sitting in the "No answer — try again"
// section, second from the bottom, with 1–3 unanswered dials and nobody at
// CareerRai ever having spoken to them. The students we most need to hear
// from were the ones the deck reached last.
//
// Both rules are pure and read only what the queue already loads: the log
// dates, and the human call history (sales_activity, self-reported).

import { loggedDaysLast7 } from '@/lib/facts/daily-log';
import { trailingWindow, inWindow, isDayKey } from '@/lib/facts/window';

/** A log breaker had a real rhythm: this many log days in the 7 ending at the last one… */
export const LOG_BREAKER_MIN_HABIT_DAYS = 3;
/**
 * …or a streak of at least this many days in a row, ending at the last log.
 * Founder, 24 Sep 2026: "add all streak breakers who have more than 1 day
 * streak on our app".
 */
export const LOG_BREAKER_MIN_STREAK = 2;
/**
 * The break: no log yesterday. Founder, 24 Sep 2026: "if I missed my log for
 * a day, then the day after tomorrow is a must-connect day" — last log on D,
 * nothing on D+1, the call is on D+2. A student whose last log was yesterday
 * may still log today, so they are not called yet.
 */
export const LOG_BREAKER_MIN_GAP_DAYS = 2;
/** After a week silent the break is no longer fresh; going_cold / restart own them. */
export const LOG_BREAKER_MAX_GAP_DAYS = 7;
/**
 * "Try 2-3 times until he connects" is the daily target, not a limit.
 * Founder, 24 Sep 2026: connecting a log breaker is non-negotiable. The card
 * stays in the first section every day until someone speaks to them, until
 * they log again, or until the break is a week old. The contact ceiling
 * (MAX_CONSECUTIVE_NO_ANSWER) still applies, as it does to every lane.
 */
export const LOG_BREAKER_TRIES_PER_DAY_TARGET = 3;
/** A daily logger: log days in the last 7, counting today. */
export const DAILY_LOGGER_MIN_DAYS = 3;
/** A daily logger has logged today or yesterday — the rhythm is live. */
export const DAILY_LOGGER_MAX_GAP_DAYS = 1;
/** One feedback conversation per fortnight is a relationship; more is pestering. */
export const FEEDBACK_EVERY_DAYS = 14;

/** One human attempt: when, and what the counsellor recorded (sales_activity.status). */
export interface Touch { atIso: string; status: string | null }

/** Outcomes that did NOT reach the student. Everything else is a conversation. */
const NOT_A_CONVERSATION = new Set(['no_answer', 'switched_off', 'messaged', 'skipped']);

export function isConversation(status: string | null): boolean {
  return status != null && status !== '' && !NOT_A_CONVERSATION.has(status);
}

function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

function daysBefore(dateStr: string, todayIst: string): number {
  return Math.round((Date.parse(`${todayIst}T00:00:00Z`) - Date.parse(`${dateStr}T00:00:00Z`)) / 86_400_000);
}

export interface LogBreaker {
  lastLog: string;
  /** Whole days since the last log (2 = logged the day before yesterday). */
  gapDays: number;
  /** Log days in the 7 ending at the last log. */
  habitDays: number;
  /** Days in a row ending at the last log. */
  streak: number;
  /** Dials since the break that did not reach them. */
  attemptsSinceBreak: number;
}

/**
 * The student logged on 3+ of 7 days, or 2+ days in a row, and has now missed
 * 2–7 days — and nobody has spoken to them since. Null once a conversation has
 * happened after the break, or once they log again. Re-evaluated every
 * morning, so the list refreshes daily.
 */
export function logBreakerOf(logDates: readonly string[], todayIst: string, touches: readonly Touch[]): LogBreaker | null {
  const days = [...new Set(logDates)].filter((d) => d <= todayIst).sort();
  const lastLog = days[days.length - 1];
  if (!lastLog) return null;
  const gapDays = daysBefore(lastLog, todayIst);
  if (gapDays < LOG_BREAKER_MIN_GAP_DAYS || gapDays > LOG_BREAKER_MAX_GAP_DAYS) return null;
  const habitDays = days.filter((d) => {
    const back = daysBefore(d, lastLog);
    return back >= 0 && back <= 6;
  }).length;
  let streak = 1;
  for (let i = days.length - 1; i > 0 && daysBefore(days[i - 1], days[i]) === 1; i--) streak++;
  if (habitDays < LOG_BREAKER_MIN_HABIT_DAYS && streak < LOG_BREAKER_MIN_STREAK) return null;

  // Only what happened AFTER the break counts. A call on the day of the last
  // log, or before it, was a different conversation with a student who was
  // still logging.
  const since = touches.filter((t) => istDate(t.atIso) > lastLog);
  if (since.some((t) => isConversation(t.status))) return null;
  const attemptsSinceBreak = since.filter((t) => t.status === 'no_answer' || t.status === 'switched_off').length;
  return { lastLog, gapDays, habitDays, streak, attemptsSinceBreak };
}

export interface DailyLogger { daysOf7: number; lastLog: string }

/**
 * Logging on 3+ of the last 7 days, the latest today or yesterday, and nobody
 * has had a conversation with them in FEEDBACK_EVERY_DAYS. The call is for
 * THEIR account of the product, not for a pitch.
 */
export function dailyLoggerOf(logDates: readonly string[], todayIst: string, touches: readonly Touch[], nowMs: number): DailyLogger | null {
  const days = [...new Set(logDates)].filter((d) => d <= todayIst).sort();
  const lastLog = days[days.length - 1];
  if (!lastLog || daysBefore(lastLog, todayIst) > DAILY_LOGGER_MAX_GAP_DAYS) return null;
  // "N of the last 7 days" is the logged-days authority's fact — read it from
  // the producer, never re-count it here (facts/logged-days-authority guard).
  if (!isDayKey(todayIst)) return null;
  const w = trailingWindow(todayIst);
  const fact = loggedDaysLast7.produce({ reportDates: days.filter((d) => isDayKey(d) && inWindow(w, d)), today: todayIst });
  if (!fact.known) return null;
  const daysOf7 = fact.value;
  if (daysOf7 < DAILY_LOGGER_MIN_DAYS) return null;
  const recent = nowMs - FEEDBACK_EVERY_DAYS * 86_400_000;
  if (touches.some((t) => isConversation(t.status) && Date.parse(t.atIso) >= recent)) return null;
  return { daysOf7, lastLog };
}

/** What the counsellor asks a log breaker. Read out as the card's action. */
export const LOG_BREAKER_ASK =
  'Non-negotiable: connect today (try 3 times). Bring them back — help them log today. If they will not, record why they stopped: an app error, something missing, no time. Their words in the remark.';

/** What the counsellor asks a daily logger. Write their answers in the remark. */
export const DAILY_LOGGER_ASK =
  'Feedback call, no pitch. Ask: why do you log every day? What do you like most? What is unique compared to other apps? What is missing, confusing or broken? Write their words in the remark.';
