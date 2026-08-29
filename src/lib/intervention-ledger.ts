import { classifyLane } from '@/lib/call-queue';
import { isInterventionType, isReasonCategory, reasonNeedsVerbatim,
  type InterventionType, type ReasonCategory } from '@/lib/intervention-taxonomy';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Writing to the learning record ──────────────────────────────────────────
//
// One row per meaningful human intervention. This module captures the state
// BEFORE and the act; a later observation sweep fills the outcome columns.
//
// SEPARATION OF CONCERNS, deliberately:
//   lead_outreach     = the lead's current STATE          (what is true now)
//   sales_activity    = the rep's CLAIM about a call      (what a human says)
//   intervention_ledger = the LESSON                       (what we learned)
//
// The rep never writes an outcome. They write what they did and what the
// student said; the product writes what the student then actually did. That
// split is what makes the outcome columns trustworthy — a rep cannot mark
// their own intervention successful.

export interface StateSnapshot {
  stateBefore: 'NEW' | 'ACTIVE' | 'AT_RISK' | 'DORMANT';
  lane: string | null;
  daysSinceLastLog: number | null;
  streakBefore: number | null;
  priorInterventions: number;
  tenureDays: number | null;
  reachableByPush: boolean | null;
}

export interface InterventionInput {
  studentId: string;
  repId: string;
  activityId?: number | null;
  channel: 'phone' | 'whatsapp' | 'in_app';
  interventionType: InterventionType;
  askMade?: string | null;
  microCommitment?: boolean;
  reasonCategory?: ReasonCategory | null;
  reasonVerbatim?: string | null;
  objection?: string | null;
}

/**
 * Read the student's state at the moment of intervention.
 *
 * DELIBERATELY NOT getRosterMomentum: that loads every student on every call
 * (the ~5k wall recorded in the architecture gate). This reads ONE student.
 *
 * Every field is best-effort — a snapshot that cannot be completed must still
 * let the intervention be recorded, because losing the lesson entirely is
 * worse than losing one of its columns. Missing fields are NULL, never zero:
 * "we did not know" and "it was zero" are different facts.
 */
export async function captureStateSnapshot(admin: any, studentId: string, nowMs = Date.now()): Promise<StateSnapshot> {
  const todayIst = new Date(nowMs).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const since30 = new Date(nowMs - 30 * 86_400_000).toISOString().slice(0, 10);

  const [{ data: prof }, { data: reports }, { data: streak }, { data: eng }, { count: priorCount }] =
    await Promise.all([
      admin.from('profiles').select('created_at, push_subscription').eq('id', studentId).maybeSingle(),
      admin.from('daily_reports').select('report_date').eq('student_id', studentId).gte('report_date', since30),
      admin.from('streak_data').select('current_streak, last_log_date').eq('student_id', studentId).maybeSingle(),
      admin.from('student_engagement').select('buddy_cta_clicks, intent_door_at').eq('student_id', studentId).maybeSingle(),
      admin.from('intervention_ledger').select('id', { count: 'exact', head: true }).eq('student_id', studentId),
    ]);

  const logDates: string[] = (reports ?? []).map((r: any) => r.report_date as string);
  const lastLog = (streak?.last_log_date as string | null) ?? (logDates.length ? logDates.slice().sort().at(-1)! : null);
  const daysSinceLastLog = lastLog
    ? Math.round((Date.parse(todayIst) - Date.parse(lastLog)) / 86_400_000)
    : null;
  const tenureDays = prof?.created_at
    ? Math.round((nowMs - Date.parse(prof.created_at as string)) / 86_400_000)
    : null;

  // classifyLane is THE lane authority — consumed, never re-implemented.
  const lane = classifyLane({
    todayIst,
    createdAt: (prof?.created_at as string | null) ?? null,
    logDates,
    buddyTaps: (eng?.buddy_cta_clicks as number | null) ?? 0,
    intentDoor: eng?.intent_door_at != null,
    momentumScore: 0,
  });

  // Five states collapse to four here (the master architecture's model):
  // never logged = NEW; silent with prior rhythm = AT_RISK; long silent =
  // DORMANT; otherwise ACTIVE.
  let stateBefore: StateSnapshot['stateBefore'];
  if (logDates.length === 0) stateBefore = 'NEW';
  else if (daysSinceLastLog != null && daysSinceLastLog >= 14) stateBefore = 'DORMANT';
  else if (daysSinceLastLog != null && daysSinceLastLog >= 3) stateBefore = 'AT_RISK';
  else stateBefore = 'ACTIVE';

  return {
    stateBefore,
    // NULL when no lane justifies contact today (call-queue §5). The
    // intervention still happened and is still worth learning from — a rep may
    // call a backlog student deliberately — so the row is written with a null
    // lane rather than being dropped or given a lane it does not have.
    lane: lane?.dueReason ?? null,
    daysSinceLastLog,
    streakBefore: (streak?.current_streak as number | null) ?? null,
    priorInterventions: priorCount ?? 0,
    tenureDays,
    reachableByPush: prof ? prof.push_subscription != null : null,
  };
}

export type LedgerWriteResult =
  | { ok: true; id: number }
  | { ok: false; error: string };

/**
 * Record one intervention. Returns a result rather than throwing: the call the
 * rep made is already saved by the time this runs, and losing the learning
 * record must never tell them their logged call did not stick.
 *
 * It DOES return the failure though — silently swallowing it would be how the
 * ledger quietly stops being complete, and an incomplete ledger is worse than
 * an obviously broken one because every trend built on it would be wrong.
 */
export async function recordIntervention(
  admin: any,
  input: InterventionInput,
  snapshot: StateSnapshot,
  nowMs = Date.now(),
): Promise<LedgerWriteResult> {
  if (!isInterventionType(input.interventionType)) {
    return { ok: false, error: `unknown intervention type: ${input.interventionType}` };
  }
  if (input.reasonCategory != null && !isReasonCategory(input.reasonCategory)) {
    return { ok: false, error: `unknown reason category: ${input.reasonCategory}` };
  }
  const verbatim = input.reasonVerbatim?.trim() || null;
  if (reasonNeedsVerbatim(input.reasonCategory) && (verbatim == null || verbatim.length < 3)) {
    // Also enforced by a CHECK constraint. Both, deliberately: the database is
    // the guarantee, this is the readable error.
    return { ok: false, error: "reason 'other' needs the student's own words" };
  }

  const ist = new Date(nowMs + 5.5 * 3600_000);
  const isoWeekday = ist.getUTCDay() === 0 ? 7 : ist.getUTCDay();

  const { data, error } = await admin.from('intervention_ledger').insert({
    student_id: input.studentId,
    rep_id: input.repId,
    activity_id: input.activityId ?? null,
    state_before: snapshot.stateBefore,
    lane: snapshot.lane,
    days_since_last_log: snapshot.daysSinceLastLog,
    streak_before: snapshot.streakBefore,
    prior_interventions: snapshot.priorInterventions,
    tenure_days: snapshot.tenureDays,
    reachable_by_push: snapshot.reachableByPush,
    channel: input.channel,
    ist_hour: ist.getUTCHours(),
    weekday: isoWeekday,
    intervention_type: input.interventionType,
    ask_made: input.askMade?.trim() || null,
    micro_commitment: input.microCommitment === true,
    reason_category: input.reasonCategory ?? null,
    reason_verbatim: verbatim,
    objection: input.objection?.trim() || null,
  }).select('id').single();

  if (error) {
    console.error('[intervention-ledger] write failed:', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, id: data.id as number };
}

/**
 * Which lane a rep was working maps to what they were TRYING to do. Derived
 * rather than asked, so the rep has one fewer field to fill and the mapping
 * stays consistent across reps.
 */
export function interventionTypeForLane(lane: string | null): InterventionType {
  switch (lane) {
    case 'new_never_logged': return 'activation';
    case 'going_cold':
    case 'broken_streak':
    case 'retry':
    case 'callback':
    case 'followup': return 'restart';
    case 'conversion': return 'conversion';
    default: return 'diagnostic';
  }
}
