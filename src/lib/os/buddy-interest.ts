/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── Buddy Interest — the hottest calls you have ─────────────────────────────
//
// Founder, 10 Aug: "Show me the students who tap the buddy screen, open it more
// than once, or spend more time there — those are the hottest calls for us."
//
// A mentor is the paid feature. A free student who keeps coming back to the
// buddy screen, reads it for minutes, taps unlock, opens a plan, or even reaches
// checkout and doesn't finish, is telling you they want it. This ranks exactly
// those students by behavioural buy-intent — richer than the declared
// wants_mentor flag, because it is what they DID, not what they ticked once at
// signup. Already-premium students are excluded: they converted; this is the
// call list of people about to.

/** Dwell longer than this per view is a tab left open, not reading — capped. */
export const DWELL_CAP_SEC = 30 * 60; // 30 minutes
const LOOKBACK_DAYS = 21;

export interface BuddySignals {
  opens: number;          // times the buddy screen was opened
  dwellSec: number;       // total time on the buddy screen (per-view capped)
  unlockOpens: number;    // tapped "unlock a buddy"
  planClicks: number;     // tapped a buddy plan
  reachedCheckout: boolean; // opened the Razorpay checkout for a buddy
}

/**
 * A single interpretable heat score. Reaching checkout is the strongest signal
 * (they were one tap from paying); explicit taps beat passive dwell; repeat
 * opens beat a single visit. Each term is capped so no one signal — or one
 * obsessive refresher — dominates.
 */
export function buddyHeat(s: BuddySignals): number {
  let h = 0;
  if (s.reachedCheckout) h += 50;
  h += Math.min(36, s.planClicks * 12);
  h += Math.min(24, s.unlockOpens * 8);
  h += Math.min(20, Math.max(0, s.opens - 1) * 2); // repeat opens, not the first
  h += Math.min(20, Math.floor(s.dwellSec / 30));  // +1 per 30s on screen
  return h;
}

/** One-line "why they're hot", built from the raw signals — never a black box. */
export function buddyReason(s: BuddySignals): string {
  const parts: string[] = [];
  if (s.reachedCheckout) parts.push('reached checkout');
  if (s.planClicks > 0) parts.push(`${s.planClicks} plan tap${s.planClicks === 1 ? '' : 's'}`);
  if (s.unlockOpens > 0) parts.push(`${s.unlockOpens} unlock tap${s.unlockOpens === 1 ? '' : 's'}`);
  if (s.opens > 1) parts.push(`opened ${s.opens}×`);
  if (s.dwellSec >= 60) parts.push(`${Math.round(s.dwellSec / 60)} min on screen`);
  else if (s.dwellSec > 0) parts.push(`${Math.round(s.dwellSec)}s on screen`);
  return parts.join(' · ') || 'visited the buddy screen';
}

export interface BuddyLead {
  id: string;
  name: string;
  phone: string | null;
  heat: number;
  signals: BuddySignals;
  reason: string;
}

export async function assembleBuddyInterest(admin: Admin, nowMs: number): Promise<BuddyLead[]> {
  const since = new Date(nowMs - LOOKBACK_DAYS * 86_400_000).toISOString();

  const [{ data: screenEv }, { data: intentEv }] = await Promise.all([
    // Buddy-screen opens, dwell, and checkout — path-scoped to the STUDENT buddy
    // screen (never the admin /admin/buddy pages).
    admin.from('student_events')
      .select('user_id, event, props')
      .in('event', ['screen_view', 'screen_exit', 'pay_checkout_opened'])
      .like('path', '/student/buddy%')
      .gte('created_at', since)
      .limit(50000),
    // Explicit buy-intent taps — inherently buddy events, path-independent.
    admin.from('student_events')
      .select('user_id, event')
      .in('event', ['buddy_unlock_open', 'buddy_plan_click'])
      .gte('created_at', since)
      .limit(50000),
  ]);

  const byUser = new Map<string, BuddySignals>();
  const get = (id: string): BuddySignals => {
    let s = byUser.get(id);
    if (!s) { s = { opens: 0, dwellSec: 0, unlockOpens: 0, planClicks: 0, reachedCheckout: false }; byUser.set(id, s); }
    return s;
  };

  for (const e of screenEv ?? []) {
    const id = e.user_id as string | null;
    if (!id) continue;
    const s = get(id);
    if (e.event === 'screen_view') s.opens += 1;
    else if (e.event === 'screen_exit') {
      const ms = Number((e.props as any)?.dwell_ms);
      if (Number.isFinite(ms) && ms > 0) s.dwellSec += Math.min(DWELL_CAP_SEC, ms / 1000);
    } else if (e.event === 'pay_checkout_opened') s.reachedCheckout = true;
  }
  for (const e of intentEv ?? []) {
    const id = e.user_id as string | null;
    if (!id) continue;
    const s = get(id);
    if (e.event === 'buddy_unlock_open') s.unlockOpens += 1;
    else if (e.event === 'buddy_plan_click') s.planClicks += 1;
  }

  const ids = [...byUser.keys()];
  if (ids.length === 0) return [];

  const { data: profs } = await admin.from('profiles')
    .select('id, full_name, phone, is_premium, buddy_id, is_test_account, is_demo, role')
    .in('id', ids);

  const leads: BuddyLead[] = [];
  for (const p of profs ?? []) {
    // Conversion targets only: real, free, no buddy yet. A premium student or one
    // who already has a mentor has converted — not a call to make.
    if (p.role !== 'student' || p.is_test_account === true || p.is_demo === true) continue;
    if (p.is_premium === true || p.buddy_id) continue;
    const s = byUser.get(p.id as string)!;
    // Must show REAL interest — a single passing open with no taps isn't a lead.
    const interested = s.opens > 1 || s.dwellSec >= 60 || s.unlockOpens > 0 || s.planClicks > 0 || s.reachedCheckout;
    if (!interested) continue;
    leads.push({
      id: p.id as string,
      name: (p.full_name as string | null) ?? 'Student',
      phone: (p.phone as string | null) ?? null,
      heat: buddyHeat(s),
      signals: s,
      reason: buddyReason(s),
    });
  }

  return leads.sort((a, b) => b.heat - a.heat);
}
