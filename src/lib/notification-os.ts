// The Notification OS — the Decision and Measurement layers of
// Signals → Decision → Action → Measurement. Three jobs, one file:
//
//   1. ONE student state, never two (computeStudentState). States gate
//      which notification families are even eligible, so two crons can
//      never fight over the same student on the same evening — the
//      structural fix for the 14:30 double-fire, not a patch.
//   2. ONE send gate (dispatch) that every student-facing nudge passes
//      through: a global 2/day budget across ALL types (the per-cron caps
//      this replaces couldn't see each other), a push cooldown after 3
//      ignored pushes, and a persisted reason + expected_action on every
//      row. If the engine can't answer why-this-student / why-now /
//      why-this-message, it doesn't send.
//   3. The ladder copy banks (builder recovery, activation). Escalation is
//      days-since-state-change with a terminal state — never campaign
//      days. Every sequence ends, and what it ends INTO is the human
//      intervention queue on /admin/leads.
//
// Conversion (premium / has-buddy) is deliberately an attribute, not a
// state: a paying student still has a routine and still gets product
// events. What they never get is sales-adjacent copy — which doesn't exist
// in the push channel at all (see the retired growth-nudges cron).

import { createAdminClient } from '@/lib/supabase/admin';
import { sendPushToUser } from '@/lib/push';

// State-based daily budgets (founder decision, post-Inshorts discussion):
// students who are ACTIVELY STUDYING get the full Study Companion cadence —
// the tray becomes a study surface, ~7-9 value-carrying touches/day. The
// old flat 2/day survives exactly where it was right all along: recovery
// states, where volume reads as nagging, not help. Setup states sit in
// between. The per-student cooldown below is the counterweight — a student
// who stops logging AND stops tapping gets automatically quieter, no
// human decision needed.
// Growth-first inversion (founder decision): the students who need PUSHING are
// the ones NOT yet using the app — signups who never logged, and dormant
// students. They get the heavy, emotional activation cadence. Students already
// showing up need far less — 4 gentle touches, not a stream.
export const BUDGET_ACTIVE = 4;    // engaged loggers: light cadence
export const BUDGET_SETUP = 8;     // building_plan / plan_ready: heavy activation
export const BUDGET_RECOVERY = 8;  // slipping / inactive / dark: heavy reactivation
export const DAILY_BUDGET = 4;     // default for any caller that doesn't say

// Every student-facing nudge type, counted against ONE shared daily budget.
// Transactional rows (session reminders, buddy replies, payment notices)
// are deliberately absent — they're consequences of the student's own
// actions, not interruptions we initiated.
export const STUDENT_BUDGET_TYPES = [
  'onboarding_morning', 'onboarding_evening', 'activation', 'builder_recovery',
  'revision_due', 'topic_earned', 'mission_changed', 'weekly_evolved', 'inactive_recovery',
  'companion_kickoff', 'companion_morning', 'companion_spark', 'companion_fact', 'companion_open',
  'companion_wind', 'companion_progress', 'companion_log', 'companion_close',
  'daily_heartbeat', 'log_recovery',
  // The evening mentor-sell push (founder, 10 Aug: "we should sell mentor" —
  // sanctioned, but it sells INSIDE the budget, not around it).
  'buddy_evening',
];

// Widened 15 Aug when transactional/buddy/admin sends were folded into this
// one gate — the four original values described only student-nudge outcomes.
// view_session/view_chat/acknowledge are honest about the rest: the admin
// health page's "did they act on it" read only special-cases the first four
// and buckets everything else sensibly, so adding names here never breaks it.
export type ExpectedAction =
  | 'log_today' | 'finish_builder' | 'open_plan' | 'open_buddy'
  | 'view_session' | 'view_chat' | 'acknowledge';

export type StudentState =
  | 'building_plan'   // Builder unfinished — blocked from the tracker; only builder-recovery may speak
  | 'plan_ready'      // Builder done, never logged — the activation ladder owns them
  | 'onboarding_arc'  // logged 1-6 days, joined <14d — the Day 1-7 habit arc owns them
  | 'active'          // logged today/yesterday, graduated — decision events
  | 'slipping'        // 2-6 days quiet — recovery ladder only
  | 'inactive'        // 7-13 days quiet — recovery ladder only
  | 'dark';           // 14+ days — one win-back on day 14, then humans only

export function computeStudentState(s: {
  onboardingCompleted: boolean;
  daysSinceLastLog: number | null; // null = never logged a day
  loggedDaysTotal: number;
  daysSinceJoin: number;
}): StudentState {
  if (!s.onboardingCompleted) return 'building_plan';
  if (s.daysSinceLastLog == null) return 'plan_ready';
  if (s.daysSinceLastLog >= 14) return 'dark';
  if (s.daysSinceLastLog >= 7) return 'inactive';
  if (s.daysSinceLastLog >= 2) return 'slipping';
  if (s.loggedDaysTotal < 7 && s.daysSinceJoin <= 14) return 'onboarding_arc';
  return 'active';
}

// ─── The send gate ──────────────────────────────────────────────────────────

export interface DispatchOptions {
  userId: string;
  type: string;
  title: string;
  body: string;
  url: string;
  reason: string;           // why-this-student-why-now, in one readable line
  expectedAction: ExpectedAction;
  prefs: Record<string, unknown>; // the caller already holds notif_prefs
  email?: { to: string; send: () => Promise<void> } | null;
  dailyBudget?: number;     // state-based cap; callers pass BUDGET_ACTIVE/SETUP/RECOVERY
  /**
   * Extra fields merged into the row's `data` column alongside `url`.
   * session-tomorrow needs this: its own dedup check reads `data->>session_id`
   * back out to stop the Vercel cron and its GitHub Actions fallback from
   * double-reminding the same session if both fire the same day. Without a
   * way to carry that field through, the honest options were duplicate
   * reminders or a second send path outside this one — this is the one that
   * keeps the guarantee "every push has exactly one path" true.
   */
  data?: Record<string, unknown>;
  /** Stable push tag: same tag = tray entries COLLAPSE (chat threads). */
  tag?: string;
  /** Sender's display name — the SW uses it for "N new messages" titles. */
  senderName?: string;
}

export type DispatchOutcome = 'sent' | 'budget_exhausted' | 'daily_cap';

// ── THE ONE SEND BOUNDARY ────────────────────────────────────────────────
//
// Every push CareerRai sends passes through this function. Nothing else in
// the codebase may import sendPushToUser — a source-scan guard
// (send-boundary.guard.test.ts) fails the build if it finds one that does.
//
// 15 Aug: fourteen call sites reached the transport directly — inserted a
// notification row, threw its id away, and sent with no way for the service
// worker to ever report a receipt or a click back to it. The same fourteen
// also skipped BOTH volume controls below, because both lived in code paths
// those callers never touched: the 10/day hard ceiling lived inside the
// transport itself (push.ts), reachable only by calling it; the state budget
// lived here, reachable only by calling here. A cap that only some callers
// can find is not a cap. It is now impossible to send a push without both
// checks running, because it is now impossible to reach the transport
// without going through them.
//
// TWO SEPARATE LIMITS, not one:
//
//   THE STATE BUDGET (soft, per-type) governs how many of the app's OWN
//   nudges — the daily activation/recovery/companion ladder — a student sees
//   in one day. It applies only to STUDENT_BUDGET_TYPES: a reply from a
//   buddy or a reminder for a session the student booked is a consequence of
//   something the student did, not an interruption CareerRai initiated, and
//   was always deliberately exempt (see that constant's own comment). When
//   this budget is hit, NOTHING is created for that call — not the push, not
//   even the in-app row — because the point is total daily volume in the
//   tray, not just the push channel.
//
//   THE HARD CEILING (10/day, every type, every recipient, "at any cost" —
//   founder, 21 July) exists so that no combination of features can bury one
//   student. It runs only when a push is actually about to be attempted, so
//   a capped push still leaves its in-app row behind — the student still
//   sees it in the tray, they just don't get buzzed for the eleventh time.
export async function dispatch(opts: DispatchOptions): Promise<DispatchOutcome> {
  const admin = createAdminClient();
  const todayStart =
    new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) + 'T00:00:00+05:30';

  if (STUDENT_BUDGET_TYPES.includes(opts.type)) {
    const { count } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', opts.userId)
      .in('type', STUDENT_BUDGET_TYPES)
      .gte('created_at', todayStart);
    if ((count ?? 0) >= (opts.dailyBudget ?? DAILY_BUDGET)) return 'budget_exhausted';
  }

  const { data: row } = await admin
    .from('notifications')
    .insert({
      user_id: opts.userId, type: opts.type, title: opts.title, body: opts.body,
      data: { url: opts.url, ...opts.data }, read: false, channel: 'in_app',
      reason: opts.reason, expected_action: opts.expectedAction,
    })
    .select('id')
    .single();

  // Auto-silence removed (founder decision): we keep pushing up to the budget for
  // every state — the whole growth thesis is that ignored ≠ stop-trying for the
  // dormant/never-active students we most need to reach. The budget is the only
  // volume control now.
  let outcome: DispatchOutcome = 'sent';
  if (opts.prefs.push === true && row?.id) {
    // The hard ceiling. Counts PUSHES (pushed_at), not notifications
    // (created_at) — a budget-exhausted call above never reaches here, and an
    // in-app-only row (push pref off) never counted against it either, both
    // exactly as before this refactor.
    const { count: pushedToday } = await admin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', opts.userId)
      .not('pushed_at', 'is', null)
      .gte('pushed_at', todayStart);
    if ((pushedToday ?? 0) >= 10) {
      console.warn(`[notif-os] daily hard cap (10) reached for ${opts.userId} — push suppressed, in-app row kept`);
      outcome = 'daily_cap';
    } else {
      const res = await sendPushToUser(opts.userId, {
        title: opts.title, body: opts.body, url: opts.url, notifId: row.id as string,
        tag: opts.tag, senderName: opts.senderName,
      });
      if (res.ok) {
        await admin.from('notifications').update({ pushed_at: new Date().toISOString() }).eq('id', row.id);
      }
    }
  }

  if (opts.email && opts.prefs.email !== false) {
    try {
      await opts.email.send();
      if (row?.id) {
        await admin.from('notifications').update({ emailed_at: new Date().toISOString() }).eq('id', row.id);
      }
    } catch (err) {
      console.error('[notif-os] email send failed:', err);
    }
  }

  return outcome;
}

// ─── Builder recovery ladder: 30min → 24h → 72h, then the human queue ───────
// Copy rule: describe the outcome, and every line must be TRUE on tap — the
// tracker reopens the Builder exactly where their saved data is.
export function builderRecoveryCopy(
  touch: 1 | 2 | 3,
  stepLabelText: string,
  screensDone: number,
  screensTotal: number
): { title: string; body: string } {
  const left = Math.max(1, screensTotal - screensDone);
  const pct = Math.round((screensDone / screensTotal) * 100);
  switch (touch) {
    case 1:
      return {
        title: pct > 0 ? `Your CAT plan is ${pct}% built` : 'Your CAT plan is waiting',
        body: `Everything you entered is saved. ${left} screen${left === 1 ? '' : 's'} left — about 2 minutes.`,
      };
    case 2:
      return {
        title: 'Your plan from yesterday is still saved',
        body: `You stopped at ${stepLabelText}. Finish it and today's routine unlocks immediately.`,
      };
    case 3:
      return {
        title: 'Your routine can still start today',
        body: `Your plan is saved at ${stepLabelText}. Two minutes to finish — it schedules around the time you have left.`,
      };
  }
}

// ─── Activation ladder: plan built, never logged. Days 0/1/3/7 after the ────
// build, then silence + the human queue. Ends forever on the first log.
export const ACTIVATION_DAYS: readonly number[] = [0, 1, 3, 7];

// Re-exported for existing server callers (crons, server pages) that import it
// from here; the definition now lives in the client-safe ./dream-college.
export { dreamCollegeLabel } from './dream-college';

// Aspirational activation vibe (Cal AI-style: tiny daily effort → the dream
// college). Honest — the plan is real, the first step really is tiny. dc is the
// student's own target college (see dreamCollegeLabel), used mid-sentence.
export function activationCopy(day: number, firstName: string, dc: string): { title: string; body: string } {
  if (day === 0) {
    return { title: 'The journey starts now', body: `${firstName}, the plan you built is live. It begins with one 5-second update toward ${dc}.` };
  }
  if (day === 1) {
    return { title: '5 seconds to get moving', body: `Your plan is built and waiting. One quick update tonight starts the journey to ${dc}.` };
  }
  if (day === 3) {
    return { title: 'Your plan is holding your spot', body: `A few minutes a day is all it takes to move toward ${dc} — start today.` };
  }
  return { title: 'Still time to make your move', body: `Your plan reshapes around the time you have left. One update today restarts the momentum toward ${dc}.` };
}
