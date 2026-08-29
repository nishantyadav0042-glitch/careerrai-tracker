// ── The ONE disposition vocabulary and cadence engine for sales calls ───────
//
// 20 Aug 2026, Sales Phase 1 (truth hotfix). The Part-1 forensic found the
// dialer writing status='no_answer' into lead_outreach while the production
// CHECK constraint rejected that value — and /api/sales/log never read the
// upsert error, so the write vanished, the API said {ok:true}, and the lead
// never re-entered the queue. State and history could permanently disagree
// on the very first real call.
//
// This module is the single authority for:
//   • what a rep can REPORT about a call            (CALL_OUTCOMES)
//   • what lead_outreach.status may HOLD            (LEAD_STATUSES)
//   • how a disposition maps to stored state + the  (planDisposition)
//     re-queue clock (next_action_at / callback_at / no_answer_count)
//
// LEAD_STATUSES must match the DB CHECK exactly — a guard test reads the
// migration (20260820a_lead_outreach_no_answer_status.sql) and fails the
// build if the two vocabularies drift apart again.

/** Connected-call outcomes — a human actually spoke. Feedback is mandatory.
 *  `dnd` (24 Aug, Sales Phase 1 foundation): the student said "stop calling
 *  me". It is a CONNECTED outcome — someone answered and said so, and the
 *  mandatory note records who and how — and it closes the lead permanently,
 *  exactly like not_interested, but with a different meaning: not_interested
 *  is "no to the offer", dnd is "no to the contact". The queue already
 *  suppressed 'dnd' before any writer could produce it; this makes the
 *  status writable instead of leaving a rep no honest way to record it. */
export const CONNECTED_OUTCOMES = ['interested', 'callback', 'converted', 'not_interested', 'dnd'] as const;

/** Everything a rep can report about a call attempt. */
export const CALL_OUTCOMES = [...CONNECTED_OUTCOMES, 'no_answer'] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** Every value lead_outreach.status may hold. Mirrors the DB CHECK — see the
 *  vocabulary guard in sales-disposition.test.ts before adding a value here. */
export const LEAD_STATUSES = [
  'not_contacted',
  'called',
  'interested',
  'follow_up',
  'converted',
  'not_interested',
  'no_answer',
  'dnd',
] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

/** Every value sales_activity.status may hold: the five call dispositions
 *  plus 'reassigned' (an admin's intentional ownership transfer, appended as
 *  history — it is NOT a call and must never drain the sales-ready signal).
 *  Mirrors the DB CHECK in 20260820c_sales_claim.sql — guard-pinned. */
export const ACTIVITY_STATUSES = [...CALL_OUTCOMES, 'reassigned'] as const;

// SA-1D's visibility rule used to live here as `leadVisibleTo(owner, repEmail)`.
// It has MOVED, not been duplicated: it is re-keyed onto profiles.id as
// `canAccessLead` in lib/sales-authz.ts. The rule itself is unchanged — an
// unclaimed lead is available to every rep, a claimed lead only to its owner —
// but the old signature carried the defect that made this phase necessary:
// `if (!owner || !repEmail) return true` meant a rep whose email was NULL was
// handed the admin oversight frame. Oversight is now granted by ROLE, and an
// unidentifiable viewer is denied. This module stays pure vocabulary.

export function isCallOutcome(v: unknown): v is CallOutcome {
  return typeof v === 'string' && (CALL_OUTCOMES as readonly string[]).includes(v);
}
export function isConnectedOutcome(v: unknown): v is (typeof CONNECTED_OUTCOMES)[number] {
  return typeof v === 'string' && (CONNECTED_OUTCOMES as readonly string[]).includes(v);
}

/** Build a UTC ISO for an IST wall-clock time `dayOffset` days from `nowMs`. */
export function istFutureIso(nowMs: number, dayOffset: number, hour: number, minute = 0): string {
  const istNow = new Date(nowMs + 5.5 * 3600_000);
  const target = Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate() + dayOffset, hour, minute);
  return new Date(target - 5.5 * 3600_000).toISOString();
}
export function istHourOf(nowMs: number): number {
  return new Date(nowMs + 5.5 * 3600_000).getUTCHours();
}

/**
 * Admin follow-up date → the one clock (SA-1A). The admin panel picks a DATE;
 * the canonical clock is a timestamptz. The date maps to 11:00 IST that day —
 * the same "late morning" slot the cadence engine already uses for an
 * interested-lead follow-up — so there is exactly one cadence model, not two.
 */
export function nextActionAtFromDate(date: string): string {
  // 11:00 IST = 05:30 UTC on the same calendar date.
  return `${date}T05:30:00.000Z`;
}

// ── THE CONTACT CEILING (29 Aug 2026) ───────────────────────────────────────
//
// Until this existed the cadence engine had no upper bound. Simulated over 30
// days against a student who never once picked up:
//
//   hot lead      → 31 calls   (the `hot` branch rolled to tomorrow morning
//                               EVERY time, ignoring the miss count entirely)
//   ordinary lead → 13 calls
//
// Thirty-one calls to someone who has never answered is not persistence, it is
// the thing that turns CareerRai from a study app into a call centre — and it
// would have landed hardest on the abandoned-checkout students, who score
// `hot` precisely because they matter most.
//
// THE PRINCIPLE, and why the cap is only on silence: a ceiling belongs where
// the student has given us NO signal at all. `interested` is deliberately left
// uncapped — someone who picks up and talks every two days is choosing to
// engage, and inventing a limit on real conversations would be a rule without
// evidence. Silence is different: it is the one case where we are the only
// participant, so we are the ones who have to stop.
//
// Both numbers are constants rather than judgement calls scattered through the
// engine, so the founder can change the policy in one place once real answer
// rates exist. Consecutive-only: any connected outcome resets noAnswerCount,
// so a student who answers once starts fresh.

/** Consecutive unanswered attempts after which we stop calling entirely. */
export const MAX_CONSECUTIVE_NO_ANSWER = 6;
/** How many daily retries a hot lead gets before it joins normal escalation. */
export const HOT_DAILY_RETRY_LIMIT = 3;

export interface DispositionPlan {
  /** Stored lead_outreach.status — always a legal LEAD_STATUSES value. */
  status: LeadStatus;
  /** When the lead re-enters the queue. null = closed (won, lost, or — for
   *  no_answer — the contact ceiling reached). */
  nextActionAt: string | null;
  /** The exact time the student asked to be called back, when outcome=callback. */
  callbackAt: string | null;
  noAnswerCount: number;
}

/**
 * The disposition → state mapping (the cadence engine):
 *   interested      → follow up in 2 days, late morning
 *   callback        → at the exact time the student asked for
 *   converted       → closed (won)
 *   not_interested  → closed forever (never resurface)
 *   dnd             → closed forever — the student said stop calling
 *   no_answer       → retry this evening or next day; hot leads always roll to
 *                     tomorrow morning; after repeated misses go cold (+3 days)
 *
 * `callbackAtLocal` is the rep-entered IST wall-clock string (YYYY-MM-DDTHH:mm),
 * required when outcome === 'callback' — the caller validates its shape.
 */
export function planDisposition(
  outcome: CallOutcome,
  opts: { prevMisses: number; hot: boolean; callbackAtLocal?: string | null; nowMs: number },
): DispositionPlan {
  const { prevMisses, hot, callbackAtLocal, nowMs } = opts;

  if (outcome === 'callback') {
    const cbAt = new Date((callbackAtLocal as string).slice(0, 16) + ':00+05:30').toISOString();
    return { status: 'follow_up', nextActionAt: cbAt, callbackAt: cbAt, noAnswerCount: 0 };
  }
  if (outcome === 'interested') {
    return { status: 'interested', nextActionAt: istFutureIso(nowMs, 2, 11, 0), callbackAt: null, noAnswerCount: 0 };
  }
  if (outcome === 'no_answer') {
    const misses = prevMisses + 1;
    // The ceiling. Six consecutive unanswered attempts spans roughly eight
    // days across morning and evening windows; a student who has not picked up
    // once in that time is telling us something, and continuing to dial is our
    // problem rather than theirs. Returning a null clock is what actually stops
    // it — the queue additionally refuses to deal these (see call-queue), so a
    // null cannot be misread downstream as "never scheduled, treat as fresh".
    if (misses >= MAX_CONSECUTIVE_NO_ANSWER) {
      return { status: 'no_answer', nextActionAt: null, callbackAt: null, noAnswerCount: misses };
    }
    let nextActionAt: string;
    if (hot && misses < HOT_DAILY_RETRY_LIMIT) {
      nextActionAt = istFutureIso(nowMs, 1, 10, 0); // never lose a hot lead — tomorrow morning
    } else if (misses < 2 && istHourOf(nowMs) < 17) {
      nextActionAt = istFutureIso(nowMs, 0, 18, 30); // evening retry today
    } else if (misses < 4) {
      nextActionAt = istFutureIso(nowMs, 1, 18, 0); // tomorrow evening
    } else {
      nextActionAt = istFutureIso(nowMs, 3, 18, 0); // going cold — space it out
    }
    return { status: 'no_answer', nextActionAt, callbackAt: null, noAnswerCount: misses };
  }
  // converted / not_interested / dnd → closed, no re-queue clock. dnd is the
  // strongest close: the student asked not to be contacted, so nothing may
  // ever schedule this lead again.
  return { status: outcome, nextActionAt: null, callbackAt: null, noAnswerCount: prevMisses };
}
