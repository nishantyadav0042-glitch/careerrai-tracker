import { leadVisibleTo } from '@/lib/sales-disposition';
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

// `repEmail` scopes the queue to one rep's actionable work (SA-1D): unclaimed
// leads plus the leads they own. Omit it (the admin oversight frame) to see
// everything, claimed or not.
export async function buildCallQueue(admin?: any, repEmail?: string | null): Promise<CallQueue> {
  const db = admin ?? createAdminClient();
  const now = Date.now();
  const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const since30 = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);

  const roster = await getRosterMomentum(db);
  const free = roster.filter((r) => !r.isPremium && !r.hasBuddy);
  const ids = free.map((r) => r.id);
  if (ids.length === 0) return { queue: [], connectedToday: 0, dueNow: 0, totalOpen: 0 };

  const [{ data: profs }, { data: eng }, { data: reports }, { data: outreach }] = await Promise.all([
    db.from('profiles').select('id, target_percentile, cat_percentile, starting_percentile, pain_points, dream_colleges, is_repeater').in('id', ids),
    db.from('student_engagement').select('student_id, buddy_cta_clicks, mock_opened, intent_door_at').in('student_id', ids),
    db.from('daily_reports').select('student_id, report_date').in('student_id', ids).gte('report_date', since30),
    db.from('lead_outreach').select('student_id, status, callback_at, next_action_at, last_attempt_at, no_answer_count, owner').in('student_id', ids),
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
    // Another rep's claimed lead is not this rep's work (SA-1D).
    if (!leadVisibleTo((o?.owner as string | null) ?? null, repEmail)) continue;
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
    if (dueNow && status === 'follow_up') { dueReason = 'callback'; dueLabel = `Callback due ${o.callback_at ? istTime(o.callback_at) : 'now'}`; sort = 100000 - nextAction!; }
    else if (dueNow && status === 'no_answer') { dueReason = 'retry'; dueLabel = `Retry — no answer${o.no_answer_count > 1 ? ` (${o.no_answer_count}×)` : ''}`; sort = 90000 - nextAction! / 1e6; }
    else if (dueNow && status === 'interested') { dueReason = 'followup'; dueLabel = 'Follow up — was interested'; sort = 80000 - nextAction! / 1e6; }

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
