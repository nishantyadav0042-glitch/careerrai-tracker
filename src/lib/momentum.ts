import { createAdminClient } from '@/lib/supabase/admin';
import { momentumStreak, daysSinceLastLog } from '@/lib/streak-utils';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Student Momentum Score — the ONE central variable (founder + CEO framing,
// 22 July). "Is this student more likely to crack CAT today than yesterday?"
// made computable. Every admin view is this score filtered differently: Sales =
// high momentum + intent, not paid. Retention = momentum falling. CEO = the
// distribution. It collapses six dashboards into one number, is derivable from
// data we already store (logs, streaks, pushes, intent), and reads identically
// at 169 students or 5 million.
//
// Explainability is a requirement, not a nicety: every score exposes the
// factors that produced it, so an operator can act on WHY, not just a number.

export type MomentumBand = 'champion' | 'on_track' | 'needs_nudge' | 'at_risk' | 'rescue';

export interface MomentumFactor { label: string; points: number } // signed contribution

export interface MomentumSignals {
  daysSinceLastLog: number | null;   // null = never logged
  activeDays14: number;              // distinct log days in the last 14
  momentumStreak: number;            // live streak (shield-aware)
  reachable: boolean;                // holds a live push subscription
  openedPushRecently: boolean;       // clicked a push in the last 7 days
  pushedRecently: boolean;           // was sent a push in the last 7 days
  buddyCtaClicks: number;            // reached for the locked buddy
  mockOpened: boolean;
}

export interface MomentumResult {
  score: number;                     // 0-100
  band: MomentumBand;
  factors: MomentumFactor[];         // sorted by |points| desc
}

const BANDS: { band: MomentumBand; min: number; label: string; color: string }[] = [
  { band: 'champion',   min: 90, label: 'Champion',        color: 'emerald' },
  { band: 'on_track',   min: 70, label: 'On track',        color: 'teal' },
  { band: 'needs_nudge', min: 50, label: 'Needs a nudge',  color: 'amber' },
  { band: 'at_risk',    min: 30, label: 'At risk',         color: 'orange' },
  { band: 'rescue',     min: 0,  label: 'Rescue required', color: 'rose' },
];

export function bandMeta(band: MomentumBand) {
  return BANDS.find((b) => b.band === band)!;
}

// Pure, testable, explainable. Weights sum to 100 at the maximum.
export function scoreMomentum(s: MomentumSignals): MomentumResult {
  const factors: MomentumFactor[] = [];

  // Recency of studying (0-40) — the strongest signal of live momentum.
  const d = s.daysSinceLastLog;
  let recency: number;
  let recencyLabel: string;
  if (d == null) { recency = 0; recencyLabel = 'never logged'; }
  else if (d === 0) { recency = 40; recencyLabel = 'logged today'; }
  else if (d === 1) { recency = 33; recencyLabel = 'logged yesterday'; }
  else if (d === 2) { recency = 26; recencyLabel = 'logged 2 days ago'; }
  else if (d === 3) { recency = 18; recencyLabel = 'logged 3 days ago'; }
  else if (d <= 6) { recency = 10; recencyLabel = `silent ${d} days`; }
  else if (d <= 13) { recency = 4; recencyLabel = `silent ${d} days`; }
  else { recency = 0; recencyLabel = `silent ${d}+ days`; }
  factors.push({ label: recencyLabel, points: recency - 20 }); // centered so "logged today" reads positive

  // Consistency (0-30) — showing up repeatedly, not once.
  const consistency = Math.round((Math.min(s.activeDays14, 14) / 14) * 30);
  factors.push({ label: `${s.activeDays14}/14 days studied`, points: consistency - 12 });

  // Notification engagement (0-15) — do our nudges actually land and work?
  let engagement: number; let engLabel: string;
  if (!s.reachable) { engagement = 0; engLabel = 'unreachable by push'; }
  else if (s.openedPushRecently) { engagement = 15; engLabel = 'opens your pushes'; }
  else if (s.pushedRecently) { engagement = 5; engLabel = 'ignoring pushes'; }
  else { engagement = 9; engLabel = 'reachable'; }
  factors.push({ label: engLabel, points: engagement - 8 });

  // Buying intent / depth (0-15) — reached for the buddy, opened a mock.
  let intent = 0; const intentBits: string[] = [];
  if (s.buddyCtaClicks >= 2) { intent += 12; intentBits.push(`tapped buddy ${s.buddyCtaClicks}×`); }
  else if (s.buddyCtaClicks === 1) { intent += 7; intentBits.push('tapped buddy'); }
  if (s.mockOpened) { intent += 4; intentBits.push('opened a mock'); }
  intent = Math.min(intent, 15);
  if (intentBits.length) factors.push({ label: intentBits.join(' · '), points: intent });

  const score = Math.max(0, Math.min(100, recency + consistency + engagement + intent));
  const band = BANDS.find((b) => score >= b.min)!.band;
  factors.sort((a, b) => Math.abs(b.points) - Math.abs(a.points));
  return { score, band, factors };
}

// ── Batch: momentum for the whole roster (for Mission Control distribution) ──

export interface RosterMomentum {
  id: string; full_name: string | null; phone: string | null;
  score: number; band: MomentumBand;
  reachable: boolean; isPremium: boolean; hasBuddy: boolean;
  daysSinceLastLog: number | null; buddyCtaClicks: number;
}

async function loadSignals(admin: any): Promise<Map<string, MomentumSignals & { full_name: string | null; phone: string | null; isPremium: boolean; hasBuddy: boolean }>> {
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: students }, { data: reports }, { data: streaks }, { data: notifs }, { data: eng }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, is_premium, buddy_id, push_subscription')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true),
    admin.from('daily_reports').select('student_id, report_date').gte('report_date', since14),
    admin.from('streak_data').select('student_id, current_streak, last_log_date, shields'),
    admin.from('notifications').select('user_id, pushed_at, clicked_at').not('pushed_at', 'is', null).gte('pushed_at', since7),
    admin.from('student_engagement').select('student_id, buddy_cta_clicks, mock_opened'),
  ]);

  const active14 = new Map<string, Set<string>>();
  for (const r of reports ?? []) {
    if (!active14.has(r.student_id)) active14.set(r.student_id, new Set());
    active14.get(r.student_id)!.add(r.report_date);
  }
  const streakById = new Map((streaks ?? []).map((s: any) => [s.student_id, s]));
  const pushedIds = new Set<string>(); const openedIds = new Set<string>();
  for (const n of notifs ?? []) { pushedIds.add(n.user_id); if (n.clicked_at) openedIds.add(n.user_id); }
  const engById = new Map((eng ?? []).map((e: any) => [e.student_id, e]));

  const out = new Map<string, any>();
  for (const p of students ?? []) {
    const st = streakById.get(p.id) as any;
    const e = engById.get(p.id) as any;
    out.set(p.id, {
      full_name: p.full_name ?? null,
      phone: p.phone ?? null,
      isPremium: p.is_premium === true,
      hasBuddy: p.buddy_id != null,
      daysSinceLastLog: daysSinceLastLog(st?.last_log_date),
      activeDays14: active14.get(p.id)?.size ?? 0,
      momentumStreak: momentumStreak(st?.current_streak, st?.shields, st?.last_log_date).streak,
      reachable: p.push_subscription != null,
      openedPushRecently: openedIds.has(p.id),
      pushedRecently: pushedIds.has(p.id),
      buddyCtaClicks: (e?.buddy_cta_clicks as number | null) ?? 0,
      mockOpened: e?.mock_opened === true,
    });
  }
  return out;
}

export async function getRosterMomentum(admin?: any): Promise<RosterMomentum[]> {
  const db = admin ?? createAdminClient();
  const signals = await loadSignals(db);
  const rows: RosterMomentum[] = [];
  for (const [id, s] of signals) {
    const { score, band } = scoreMomentum(s);
    rows.push({
      id, full_name: s.full_name, phone: s.phone, score, band,
      reachable: s.reachable, isPremium: s.isPremium, hasBuddy: s.hasBuddy,
      daysSinceLastLog: s.daysSinceLastLog, buddyCtaClicks: s.buddyCtaClicks,
    });
  }
  return rows.sort((a, b) => b.score - a.score);
}

export interface BandCount { band: MomentumBand; count: number }
export function momentumDistribution(roster: RosterMomentum[]): BandCount[] {
  const order: MomentumBand[] = ['champion', 'on_track', 'needs_nudge', 'at_risk', 'rescue'];
  return order.map((band) => ({ band, count: roster.filter((r) => r.band === band).length }));
}

// ── Single student: the detailed momentum + a recommended next action ──

export interface StudentMomentum extends MomentumResult {
  signals: MomentumSignals;
  recommendedAction: { text: string; urgency: 'now' | 'soon' | 'watch' | 'leave' };
}

export async function getStudentMomentum(admin: any, studentId: string): Promise<StudentMomentum | null> {
  const signals = await loadSignals(admin);
  const s = signals.get(studentId);
  if (!s) return null;
  const result = scoreMomentum(s);
  return { ...result, signals: s, recommendedAction: recommendAction(result.band, s) };
}

// The whole point of the score: end every view with an ACTION, not a number.
function recommendAction(band: MomentumBand, s: MomentumSignals & { isPremium: boolean; hasBuddy: boolean }): StudentMomentum['recommendedAction'] {
  if (s.isPremium || s.hasBuddy) return { text: 'Paying / matched — keep them winning; no sales ask.', urgency: 'leave' };
  if (!s.reachable && s.daysSinceLastLog != null) return { text: 'Notifications are dead — recover via reconnect / WhatsApp before anything else.', urgency: 'soon' };
  if ((band === 'champion' || band === 'on_track') && s.buddyCtaClicks >= 1) return { text: 'HOT: studying hard AND reached for a buddy. Call about the buddy now.', urgency: 'now' };
  if (band === 'champion' || band === 'on_track') return { text: 'Strong momentum. Warm buddy pitch — they trust the product.', urgency: 'soon' };
  if (band === 'at_risk' && s.buddyCtaClicks >= 1) return { text: 'Slipping but interested — call before the habit dies.', urgency: 'now' };
  if (band === 'at_risk' || band === 'needs_nudge') return { text: 'Momentum fading — a specific, kind nudge (or one honest log) turns this around.', urgency: 'watch' };
  return { text: 'Rescue: long silent. One real reason to come back, or leave for a re-engagement campaign.', urgency: 'watch' };
}
