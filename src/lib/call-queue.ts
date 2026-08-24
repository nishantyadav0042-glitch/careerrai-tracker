import { canAccessLead, loadStaffDirectory, resolveOwnerToken, type SalesPrincipal } from '@/lib/sales-authz';
import { getRosterMomentum, bandMeta } from '@/lib/momentum';
import { createAdminClient } from '@/lib/supabase/admin';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The dialer work-queue — how a call centre actually runs a day. Not the whole
// base: a capped, prioritized rotation that refreshes every day.
//
// Priority order (top = call first):
//   1. Callbacks due    — a promise to the student ("call me at 6"), at its time
//   2. Retry due        — a no-answer whose evening/next-day retry has arrived
//   3. Follow-up due     — an interested lead's scheduled nudge
//   4. Fresh leads       — never called, highest conversion score first
//
// Suppression (why a lead is NOT shown):
//   • converted / not_interested        → closed forever
//   • dispositioned today (not due now) → no repeat calls the same day
//
// Every card carries a weakness BRIEF (what she reads to have a real
// conversation) — buddy intent, tracking quality, mock analysis, onboarding
// goals — never a canned message.

export type DueReason = 'callback' | 'retry' | 'followup' | 'fresh';

export interface CallLead {
  studentId: string; name: string; firstName: string; phone: string | null; waNumber: string | null;
  convScore: number; tier: 'hot' | 'warm' | 'cool'; momentumScore: number; momentumBand: string;
  hot: boolean;
  brief: string[];              // the diagnostic the rep reads before dialing
  dueReason: DueReason; dueLabel: string;
  status: string | null; noAnswerCount: number;
  buddyTaps: number;
}

export interface CallQueue { queue: CallLead[]; connectedToday: number; dueNow: number; totalOpen: number }

const CAP = 60; // 50–70 band — a real day's dialing list, not the whole base

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
    db.from('profiles').select('id, target_percentile, cat_percentile, starting_percentile, pain_points, dream_colleges, is_repeater').in('id', ids),
    db.from('student_engagement').select('student_id, buddy_cta_clicks, mock_opened, intent_door_at').in('student_id', ids),
    db.from('daily_reports').select('student_id, report_date').in('student_id', ids).gte('report_date', since30),
    // The only read here that decides a business state — checked, retried, or thrown.
    readLeadOutreach(db, ids),
  ]);
  const profById = new Map((profs ?? []).map((p: any) => [p.id, p]));
  const engById = new Map((eng ?? []).map((e: any) => [e.student_id, e]));
  const logs30 = new Map<string, number>();
  for (const r of reports ?? []) logs30.set(r.student_id, (logs30.get(r.student_id) ?? 0) + 1);
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
    const nLogs = logs30.get(r.id) ?? 0;

    // Conversion score (intent-weighted), matches the rest of the system.
    let conv = Math.round(r.score * 0.35);
    if (buddyTaps >= 2) conv += 30; else if (buddyTaps >= 1) conv += 18;
    if (mock) conv += 8; if (intentDoor) conv += 12;
    if (r.daysSinceLastLog != null && r.daysSinceLastLog <= 3) conv += 15;
    const tier: CallLead['tier'] = (buddyTaps >= 1 && r.daysSinceLastLog != null && r.daysSinceLastLog <= 3) ? 'hot' : (buddyTaps >= 1 || mock || r.score >= 50) ? 'warm' : 'cool';

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
    let dueReason: DueReason = 'fresh';
    let dueLabel = 'New lead';
    let sort = conv; // fresh leads ranked by score
    //
    // Ranking (fixed 21 Aug). These three lines used to subtract a raw epoch
    // millisecond from a five-figure base — `100000 - nextAction` is about
    // MINUS 1.8 trillion — so every due callback, retry and follow-up sorted
    // BELOW a cold fresh lead scoring ~14. The priority order documented at
    // the top of this file was exactly inverted in production: a student who
    // said "call me at 6" sank under students nobody had ever spoken to.
    // Nothing caught it because no test had ever driven a due lead and a
    // fresh lead through the queue together.
    //
    // Tier first, time second: a tier base far above any conversion score
    // (which tops out near 150), plus MINUTES OVERDUE inside the tier, so the
    // longest-waiting promise is called first. A tier is 1,000,000 wide —
    // roughly two years of overdue minutes — so tiers can never interleave.
    const minutesOverdue = () => Math.min(999_999, Math.max(0, Math.round((now - nextAction!) / 60_000)));
    if (dueNow && status === 'follow_up') { dueReason = 'callback'; dueLabel = `Callback due ${o.callback_at ? istTime(o.callback_at) : 'now'}`; sort = 3_000_000 + minutesOverdue(); }
    else if (dueNow && status === 'no_answer') { dueReason = 'retry'; dueLabel = `Retry — no answer${o.no_answer_count > 1 ? ` (${o.no_answer_count}×)` : ''}`; sort = 2_000_000 + minutesOverdue(); }
    else if (dueNow && status === 'interested') { dueReason = 'followup'; dueLabel = 'Follow up — was interested'; sort = 1_000_000 + minutesOverdue(); }

    cands.push({
      studentId: r.id, name: r.full_name ?? 'Student', firstName: (r.full_name ?? '').trim().split(' ')[0] || 'there',
      phone: r.phone, waNumber: waNumber(r.phone),
      convScore: conv, tier, momentumScore: r.score, momentumBand: bandMeta(r.band).label, hot: tier === 'hot',
      brief, dueReason, dueLabel, status, noAnswerCount: (o?.no_answer_count as number | null) ?? 0, buddyTaps,
      _sort: sort,
    });
  }

  cands.sort((a, b) => b._sort - a._sort);
  const dueNow = cands.filter((c) => c.dueReason !== 'fresh').length;
  const queue = cands.slice(0, CAP).map(({ _sort, ...c }) => { void _sort; return c; });
  return { queue, connectedToday, dueNow, totalOpen };
}
