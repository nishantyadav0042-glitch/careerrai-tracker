import { canAccessLead, loadStaffDirectory, resolveOwnerToken, type SalesPrincipal } from '@/lib/sales-authz';
import { getRosterMomentum, bandMeta } from '@/lib/momentum';
import { createAdminClient } from '@/lib/supabase/admin';
import { scoreConversion, conversionTier } from '@/lib/sales-score';
import {
  GOING_COLD_SILENT_DAYS, GOING_COLD_MIN_PRIOR_DAYS,
  BROKEN_STREAK_MIN_RUN, BROKEN_STREAK_MAX_DAYS_SINCE,
  NEW_LEAD_MIN_AGE_DAYS, NEW_LEAD_MAX_AGE_DAYS,
} from '@/lib/os/scale-config';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The dialer work-queue — how a call centre actually runs a day. Not the whole
// base: a capped, prioritized rotation that refreshes every day.
//
// Priority order (top = call first) — founder build order, 24 Aug: the rep's
// Job #1 is retention, so the retention lanes sit ABOVE fresh conversion work
// and only below promises already made:
//   1. Callback due      — a promise to the student ("call me at 6"), at its time
//   2. Retry due         — a no-answer whose evening/next-day retry has arrived
//   3. Follow-up due     — an interested lead's scheduled nudge
//   4. Going cold        — studied most of the previous week, silent 3+ days
//   5. Broken streak     — a 5+ day daily run that ended in the last 3 days
//   6. New, never logged — joined 1–7 days ago, still no first study log
//   7. Conversion        — buddy-intent signals (taps / intent door)
//   8. Fresh             — everyone else, highest conversion score first
//
// EVERY card explains itself (founder, 24 Aug: "WHY THIS STUDENT IS HERE").
// `lane`/`why`/`action` are the explanation: the trigger, the evidence with
// real numbers, and the recommended move. Deterministic predicates over named
// tables — never an opaque score (blueprint §20).
//
// Suppression (why a lead is NOT shown):
//   • converted / not_interested / dnd  → closed forever
//   • dispositioned today (not due now) → no repeat calls the same day
//
// Every card also carries the weakness BRIEF (what she reads to have a real
// conversation) — buddy intent, tracking quality, mock analysis, onboarding
// goals — never a canned message.

export type DueReason =
  | 'callback' | 'retry' | 'followup'
  | 'going_cold' | 'broken_streak' | 'new_never_logged'
  | 'conversion' | 'fresh';

export interface CallLead {
  studentId: string; name: string; firstName: string; phone: string | null; waNumber: string | null;
  convScore: number; tier: 'hot' | 'warm' | 'cool'; momentumScore: number; momentumBand: string;
  hot: boolean;
  brief: string[];              // the diagnostic the rep reads before dialing
  dueReason: DueReason; dueLabel: string;
  why: string[];                // WHY THIS STUDENT IS HERE — evidence, real numbers
  action: string;               // the recommended move, one line
  status: string | null; noAnswerCount: number;
  buddyTaps: number;
}

export interface CallQueue { queue: CallLead[]; connectedToday: number; dueNow: number; totalOpen: number }

const CAP = 60; // 50–70 band — a real day's dialing list, not the whole base
// With ~340 signups a week, the never-logged lane alone could fill the whole
// deck and starve every other lane. Per-lane ceilings keep the day balanced;
// priority still decides WHICH never-logged students make the cut (newest
// first — day-1 is when the activation call lands).
const LANE_CAPS: Partial<Record<DueReason, number>> = { new_never_logged: 25, fresh: 15 };

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}
function istDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function istTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}

// ── Lane classification — pure and unit-tested (sales-lanes.guard.test.ts) ──
//
// Input is what the queue already loads (log dates, signup date, intent
// signals); output is the lane with its evidence and recommended action.
// Day arithmetic runs on IST calendar dates — the same day boundary the rest
// of the queue uses — so "0 of the last 3 days" means the same thing to the
// classifier, the student's streak, and the rep reading the card.

export interface LaneSignals {
  todayIst: string;             // 'YYYY-MM-DD' in Asia/Kolkata
  createdAt: string | null;     // profiles.created_at (ISO)
  logDates: string[];           // daily_reports.report_date values, last 30d
  buddyTaps: number;
  intentDoor: boolean;
  momentumScore: number;
}

export interface LaneVerdict {
  dueReason: Extract<DueReason, 'going_cold' | 'broken_streak' | 'new_never_logged' | 'conversion' | 'fresh'>;
  dueLabel: string;
  why: string[];
  action: string;
  /** Sort value INSIDE the lane band — the caller adds the band base. */
  sortBoost: number;
}

function daysBetweenIst(dateStr: string, todayIst: string): number {
  return Math.round((Date.parse(todayIst) - Date.parse(dateStr)) / 86_400_000);
}

/** Longest consecutive-day run ending at the most recent log. */
function trailingRunLength(sortedDaysAgo: number[]): number {
  if (sortedDaysAgo.length === 0) return 0;
  let run = 1;
  for (let i = 1; i < sortedDaysAgo.length; i++) {
    if (sortedDaysAgo[i] === sortedDaysAgo[i - 1] + 1) run++;
    else break;
  }
  return run;
}

export function classifyLane(s: LaneSignals): LaneVerdict {
  const daysAgo = [...new Set(s.logDates)]
    .map((d) => daysBetweenIst(d, s.todayIst))
    .filter((n) => n >= 0)
    .sort((a, b) => a - b);
  const lastLog = daysAgo[0] ?? null;
  const last3 = daysAgo.filter((n) => n < GOING_COLD_SILENT_DAYS).length;
  const prevWeek = daysAgo.filter((n) => n >= GOING_COLD_SILENT_DAYS && n <= GOING_COLD_SILENT_DAYS + 6).length;
  const signupDaysAgo = s.createdAt ? daysBetweenIst(istDateStr(s.createdAt), s.todayIst) : null;
  const fmt = (n: number) => (n === 0 ? 'today' : n === 1 ? 'yesterday' : `${n} days ago`);

  // Going cold: a real study rhythm existed, then went silent. The founder's
  // own example: "Studied 5 of last 7 days → 0 of last 3".
  if (last3 === 0 && prevWeek >= GOING_COLD_MIN_PRIOR_DAYS) {
    return {
      dueReason: 'going_cold', dueLabel: 'Going cold',
      why: [
        `Studied ${prevWeek} of the 7 days before → 0 in the last ${GOING_COLD_SILENT_DAYS}`,
        lastLog != null ? `Last study: ${fmt(lastLog)}` : 'Last study: unknown',
      ],
      action: 'Call today — ask what changed, get one small task done tonight',
      sortBoost: prevWeek * 1000 + s.momentumScore,
    };
  }

  // Broken streak: a 5+ day daily run that ended within the last 3 days —
  // the habit is still warm, so this outranks the colder lanes' urgency.
  const run = trailingRunLength(daysAgo);
  if (run >= BROKEN_STREAK_MIN_RUN && lastLog != null && lastLog >= 1 && lastLog <= BROKEN_STREAK_MAX_DAYS_SINCE) {
    return {
      dueReason: 'broken_streak', dueLabel: 'Broken streak',
      why: [`${run}-day streak ended ${fmt(lastLog)}`, 'The habit is still warm — this is the win-back window'],
      action: 'Win-back call — name the streak, help restart today',
      sortBoost: run * 1000,
    };
  }

  // New and never logged: the activation call. 1-day grace after signup (a
  // call two hours after joining reads as surveillance, not help); after 7
  // days they fall through to fresh — the moment has passed.
  if (signupDaysAgo != null && signupDaysAgo >= NEW_LEAD_MIN_AGE_DAYS && signupDaysAgo <= NEW_LEAD_MAX_AGE_DAYS && daysAgo.length === 0) {
    return {
      dueReason: 'new_never_logged', dueLabel: 'New — never logged',
      why: [`Joined ${fmt(signupDaysAgo)}`, 'No first study log yet'],
      action: 'Help them finish Day 1 — one logged task is the hook',
      sortBoost: (7 - signupDaysAgo) * 1000,
    };
  }

  // Conversion: declared buddy intent. The evidence is the student's own
  // taps, never an inferred "readiness".
  if (s.buddyTaps >= 1 || s.intentDoor) {
    const why: string[] = [];
    if (s.buddyTaps >= 2) why.push(`Tapped the buddy option ${s.buddyTaps}× — actively wants a mentor`);
    else if (s.buddyTaps === 1) why.push('Opened the buddy option once');
    if (s.intentDoor) why.push('Came back to the buddy a second time (intent door)');
    if (lastLog != null && lastLog <= 3) why.push(`Active — studied ${fmt(lastLog)}`);
    return {
      dueReason: 'conversion', dueLabel: 'Buddy interest',
      why,
      action: 'Pitch the ₹299 session — intent is warm, lead with their prep',
      sortBoost: s.buddyTaps * 1000 + (s.intentDoor ? 500 : 0) + s.momentumScore,
    };
  }

  return {
    dueReason: 'fresh', dueLabel: 'New lead',
    why: [lastLog != null ? `Last study: ${fmt(lastLog)}` : 'No study logs in 30 days'],
    action: 'Introduction call — learn where they are in prep',
    sortBoost: 0,
  };
}

/**
 * Read the lead state for these students — or THROW.
 *
 * BOUNDARY 2 applied to sales (21 Aug). This read used to be destructured
 * with the error never inspected, and it is the one read in the queue that
 * carries BUSINESS STATE: who is converted, who said no, who owns the lead,
 * and when the next action is due. A failed read made `outreach` null, so
 * every lead looked fresh and unowned — a converted paying student and a
 * student who explicitly said "never call me again" would both be handed
 * back to a rep as a new lead, and another rep's claimed book would appear
 * in your queue. That is an infrastructure failure wearing a business
 * answer's clothes, in the surface where it costs the most trust.
 *
 * Retry once so a blip stays invisible, then throw. An unreadable queue must
 * surface as an error the rep can retry, never as a confident wrong list.
 */
async function readLeadOutreach(db: any, ids: string[]): Promise<any[]> {
  let lastMessage = 'unknown';
  for (let attempt = 0; attempt < 2; attempt++) {
    const { data, error } = await db
      .from('lead_outreach')
      .select('student_id, status, callback_at, next_action_at, last_attempt_at, no_answer_count, owner_id, owner')
      .in('student_id', ids);
    if (!error) return data ?? [];
    lastMessage = error.message;
  }
  throw new Error(`Could not read the sales queue state: ${lastMessage}`);
}

// `viewer` scopes the queue to one rep's actionable work (SA-1D): unclaimed
// leads plus the leads they own. An `admin` viewer sees everything.
//
// R3 (23 Aug): this used to take `repEmail`, and the caller derived it as
// `role==='sales' ? (email ?? null) : undefined`. A rep with no email therefore
// passed null, and the old `leadVisibleTo(owner, null)` returned true for every
// lead — a missing column silently granted the founder's oversight frame.
// Oversight is now granted by ROLE, never by absence, and ownership is compared
// on profiles.id. A viewer we cannot identify sees only unclaimed leads.
export async function buildCallQueue(admin?: any, viewer?: SalesPrincipal | null): Promise<CallQueue> {
  const db = admin ?? createAdminClient();
  const staff = await loadStaffDirectory(db);
  const now = Date.now();
  const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const since30 = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);

  const roster = await getRosterMomentum(db);
  const free = roster.filter((r) => !r.isPremium && !r.hasBuddy);
  const ids = free.map((r) => r.id);
  if (ids.length === 0) return { queue: [], connectedToday: 0, dueNow: 0, totalOpen: 0 };

  const [{ data: profs }, { data: eng }, { data: reports }, outreach] = await Promise.all([
    db.from('profiles').select('id, created_at, target_percentile, cat_percentile, starting_percentile, pain_points, dream_colleges, is_repeater').in('id', ids),
    db.from('student_engagement').select('student_id, buddy_cta_clicks, mock_opened, intent_door_at').in('student_id', ids),
    db.from('daily_reports').select('student_id, report_date').in('student_id', ids).gte('report_date', since30),
    // The only read here that decides a business state — checked, retried, or thrown.
    readLeadOutreach(db, ids),
  ]);
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const engById = new Map((eng ?? []).map((e: any) => [e.student_id, e]));
  // Per-student log DATES, not just counts — the lane classifier reads the
  // pattern ("5 of the previous 7 → 0 of the last 3"), not the total.
  const logDates = new Map<string, string[]>();
  for (const r of reports ?? []) {
    if (!logDates.has(r.student_id)) logDates.set(r.student_id, []);
    logDates.get(r.student_id)!.push(r.report_date);
  }
  const outById = new Map((outreach ?? []).map((o: any) => [o.student_id, o]));

  let connectedToday = 0;
  for (const o of outreach ?? []) {
    if (o.last_attempt_at && istDateStr(o.last_attempt_at) === todayIst && o.status && o.status !== 'no_answer') connectedToday++;
  }

  const CLOSED = new Set(['converted', 'not_interested', 'dnd']);
  const cands: (CallLead & { _sort: number })[] = [];
  let totalOpen = 0;

  for (const r of free) {
    const o = outById.get(r.id) as any;
    const status = (o?.status as string | null) ?? null;
    if (status && CLOSED.has(status)) continue; // gone forever
    // Another rep's claimed lead is not this rep's work (SA-1D). Resolved
    // through profiles.id: an owner token we cannot attribute is withheld, not
    // treated as unclaimed — an unattributable owner is an unanswered question,
    // not a free lead.
    // owner_id is the authority; `owner` (TEXT) is the legacy encoding, still
    // resolved so a pre-migration row attributes correctly.
    const ownerId = (o?.owner_id as string | null) ?? null;
    const ownership = ownerId
      ? ({ kind: 'owned', ownerId } as const)
      : resolveOwnerToken((o?.owner as string | null) ?? null, staff);
    if (!canAccessLead(ownership, viewer ?? null)) continue;
    totalOpen++;

    const nextAction = o?.next_action_at ? new Date(o.next_action_at).getTime() : null;
    const dueNow = nextAction != null && nextAction <= now;
    const attemptedToday = o?.last_attempt_at && istDateStr(o.last_attempt_at) === todayIst;
    // No repeat calls the same day unless a scheduled action is now due.
    if (attemptedToday && !dueNow) continue;
    // A future scheduled action that isn't due yet — not today's work.
    if (nextAction != null && !dueNow) continue;

    const prof = profById.get(r.id) as any;
    const e = engById.get(r.id) as any;
    const buddyTaps = (e?.buddy_cta_clicks as number | null) ?? 0;
    const intentDoor = e?.intent_door_at != null;
    const mock = e?.mock_opened === true;
    const dates = logDates.get(r.id) ?? [];
    const nLogs = dates.length;

    // Conversion score + tier — ONE implementation, shared with the rep's
    // student page (lib/sales-score). It used to be hand-copied into both.
    const signals = {
      momentumScore: r.score, buddyTaps, mockOpened: mock, intentDoor,
      activeRecently: r.daysSinceLastLog != null && r.daysSinceLastLog <= 3,
    };
    const conv = scoreConversion(signals);
    const tier = conversionTier(signals);

    // ── Weakness BRIEF (what she reads before dialing) ──
    const brief: string[] = [];
    if (intentDoor) brief.push('Came back to the buddy — strong intent');
    if (buddyTaps >= 2) brief.push(`Wants a buddy — tapped ${buddyTaps}×`);
    else if (buddyTaps === 1) brief.push('Opened the buddy option once');
    else brief.push('Hasn’t asked for a buddy yet');
    brief.push(nLogs === 0 ? 'Not tracking at all (0 logs/30d)' : nLogs <= 3 ? `Poor tracking — ${nLogs} logs/30d` : `Tracking ${nLogs} logs/30d`);
    brief.push(mock ? 'Opened a mock' : 'Never analysed a mock');
    if (prof?.target_percentile) brief.push(`Wants ${prof.target_percentile}%ile${prof?.cat_percentile ? `, at ${prof.cat_percentile} now` : ''}`);
    if (prof?.is_repeater) brief.push('Repeater');
    const pains = Array.isArray(prof?.pain_points) ? (prof.pain_points as string[]) : [];
    for (const p of pains.slice(0, 2)) brief.push(String(p).replace(/_/g, ' '));

    // ── Why it's in today's queue + priority ──
    //
    // Ranking (fixed 21 Aug). These lines used to subtract a raw epoch
    // millisecond from a five-figure base — `100000 - nextAction` is about
    // MINUS 1.8 trillion — so every due callback, retry and follow-up sorted
    // BELOW a cold fresh lead scoring ~14. The priority order documented at
    // the top of this file was exactly inverted in production: a student who
    // said "call me at 6" sank under students nobody had ever spoken to.
    // Nothing caught it because no test had ever driven a due lead and a
    // fresh lead through the queue together.
    //
    // Tier first, time second: a tier base far above any lane boost (which
    // tops out near 10,000), plus MINUTES OVERDUE inside the due tiers, so
    // the longest-waiting promise is called first. A tier is 1,000,000 wide —
    // roughly two years of overdue minutes — so tiers can never interleave.
    let dueReason: DueReason;
    let dueLabel: string;
    let why: string[];
    let action: string;
    let sort: number;
    const minutesOverdue = () => Math.min(999_999, Math.max(0, Math.round((now - nextAction!) / 60_000)));
    if (dueNow && status === 'follow_up') {
      dueReason = 'callback'; dueLabel = `Callback due ${o.callback_at ? istTime(o.callback_at) : 'now'}`;
      why = [`They asked to be called${o.callback_at ? ` at ${istTime(o.callback_at)}` : ' back'} — a promise was made`];
      action = 'Call now — keep the promise';
      sort = 7_000_000 + minutesOverdue();
    } else if (dueNow && status === 'no_answer') {
      dueReason = 'retry'; dueLabel = `Retry — no answer${o.no_answer_count > 1 ? ` (${o.no_answer_count}×)` : ''}`;
      why = [`No answer ${o.no_answer_count > 1 ? `${o.no_answer_count} times` : 'last time'} — the retry window has arrived`];
      action = 'Try again — a different hour often lands';
      sort = 6_000_000 + minutesOverdue();
    } else if (dueNow && status === 'interested') {
      dueReason = 'followup'; dueLabel = 'Follow up — was interested';
      why = ['Said interested on the last call — the scheduled nudge is due'];
      action = 'Follow up and close the next concrete step';
      sort = 5_000_000 + minutesOverdue();
    } else {
      // No promise pending — the lane classifier decides why today's call
      // exists at all: retention first, conversion second, fresh last.
      const lane = classifyLane({
        todayIst, createdAt: (prof?.created_at as string | null) ?? null, logDates: dates,
        buddyTaps, intentDoor, momentumScore: r.score,
      });
      dueReason = lane.dueReason; dueLabel = lane.dueLabel; why = lane.why; action = lane.action;
      const BAND: Record<string, number> = { going_cold: 4_000_000, broken_streak: 3_500_000, new_never_logged: 3_000_000, conversion: 1_000_000, fresh: 0 };
      sort = BAND[lane.dueReason] + lane.sortBoost + (lane.dueReason === 'fresh' ? conv : 0);
    }

    cands.push({
      studentId: r.id, name: r.full_name ?? 'Student', firstName: (r.full_name ?? '').trim().split(' ')[0] || 'there',
      phone: r.phone, waNumber: waNumber(r.phone),
      convScore: conv, tier, momentumScore: r.score, momentumBand: bandMeta(r.band).label, hot: tier === 'hot',
      brief, dueReason, dueLabel, why, action, status, noAnswerCount: (o?.no_answer_count as number | null) ?? 0, buddyTaps,
      _sort: sort,
    });
  }

  cands.sort((a, b) => b._sort - a._sort);
  const dueNow = cands.filter((c) => c.dueReason === 'callback' || c.dueReason === 'retry' || c.dueReason === 'followup').length;
  // Per-lane ceilings (see LANE_CAPS above), then the day cap. Priority
  // within a lane already decided who makes the cut.
  const laneCount = new Map<DueReason, number>();
  const capped: typeof cands = [];
  for (const c of cands) {
    const cap = LANE_CAPS[c.dueReason];
    const n = laneCount.get(c.dueReason) ?? 0;
    if (cap != null && n >= cap) continue;
    laneCount.set(c.dueReason, n + 1);
    capped.push(c);
    if (capped.length >= CAP) break;
  }
  const queue = capped.map(({ _sort, ...c }) => { void _sort; return c; });
  return { queue, connectedToday, dueNow, totalOpen };
}
