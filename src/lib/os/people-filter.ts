import { classifyStudent, type Priority } from './student-priority';

// ── People, filtered by audience — the operating primitive ──────────────────
//
// Founder, 9 Aug: "one person handling 100,000 students. I should never scroll
// 250 students to find one. Healthy things disappear, broken things surface.
// Filter by combining audiences — Premium + Active yesterday + Needs buddy —
// and get exactly those seven, instantly. No tabs. Gmail, not a database."
//
// So this is not a students list. It is a filter engine over people, where the
// dimensions combine (AND), the default sort is business priority (never
// alphabetical), and the healthy majority is simply never the answer to a
// filter. It is pure and deterministic — the page reads URL params, this
// decides who matches and in what order, a test proves the combinations.
//
// SCALE NOTE. At 258 students the page loads everyone and filters in memory.
// The dimensions here map cleanly onto WHERE clauses, so at 100k the same
// filter values push into the query (premium → .eq('is_premium',true), etc.)
// with no change to the vocabulary the UI speaks. The model is built to move to
// the database without the founder's mental model changing.

export type SubState = 'premium' | 'payment_pending' | 'payment_failed' | 'expired' | 'free';
export type BuddyState = 'assigned' | 'wants' | 'none';
export type ActivityState = 'today' | 'yesterday' | 'this_week' | 'going_cold' | 'inactive';

export interface PersonFacts {
  isPremium: boolean;
  subscriptionStatus: string | null;   // free | active | expired | refund_requested
  hasPaymentPending: boolean;           // a `created` order, not premium
  hasPaymentFailed: boolean;            // a `failed` order, not premium
  hasBuddy: boolean;
  wantsBuddy: boolean;
  paymentStuck: boolean;                // paid but not premium (sacred fault)
  hasPlan: boolean;
  daysSinceLog: number | null;
}

// ── Derived states, each from one clear rule ────────────────────────────────

export function deriveSubscription(f: PersonFacts): SubState {
  if (f.isPremium) return 'premium';
  if (f.hasPaymentPending) return 'payment_pending';
  if (f.hasPaymentFailed) return 'payment_failed';
  if (f.subscriptionStatus === 'expired') return 'expired';
  return 'free';
}

export function deriveBuddy(f: PersonFacts): BuddyState {
  if (f.hasBuddy) return 'assigned';
  // "wants" is a FREE-tier sales signal only. A premium student with no buddy is
  // not a lead — they are an unassigned fault, and must classify as 'none' so
  // that sub=premium & buddy=none reproduces EXACTLY the sacred/inbox definition
  // (premium AND buddy_id null). Otherwise a premium student who once tapped the
  // buddy CTA would be counted by "paying, no mentor" but hidden from its link.
  if (f.wantsBuddy && !f.isPremium) return 'wants';
  return 'none';
}

/**
 * The ONE going-cold threshold (10 Aug: founder said "unify"). Days of silence
 * after which a student is a churn risk. Used by BOTH this derivation and
 * admin-filters.getGoingCold, which used to disagree (4 days vs 7). 4 = the
 * earlier warning, so we catch a cooling student before they're gone.
 */
export const GOING_COLD_DAYS = 4;

export function deriveActivity(daysSinceLog: number | null): ActivityState {
  if (daysSinceLog == null) return 'inactive';
  if (daysSinceLog <= 0) return 'today';
  if (daysSinceLog === 1) return 'yesterday';
  if (daysSinceLog < GOING_COLD_DAYS) return 'this_week';
  return 'going_cold';
}

// Honest labels. A student is Premium (paid, has a mentor) or Free (using the
// app, has not subscribed) — or in one of the specific states between the two.
// Each has a colour so the eye sorts them at a glance. This file refused to
// print "Free beta" before the DB stopped storing it (20260810g).
export const SUB_META: Record<SubState, { label: string; tone: 'green' | 'stone' | 'amber' | 'red' | 'orange' }> = {
  premium:         { label: 'Premium', tone: 'green' },
  payment_pending: { label: 'Payment pending', tone: 'amber' },
  payment_failed:  { label: 'Payment failed', tone: 'red' },
  expired:         { label: 'Expired', tone: 'orange' },
  free:            { label: 'Free', tone: 'stone' },
};

export const ACTIVITY_META: Record<ActivityState, string> = {
  today: 'Active today', yesterday: 'Active yesterday', this_week: 'This week',
  going_cold: 'Going cold', inactive: 'Never logged',
};

export interface PersonRow {
  id: string;
  name: string;
  phone: string | null;
  sub: SubState;
  buddy: BuddyState;
  activity: ActivityState;
  priority: Priority;
  reason: string;
}

export function toPersonRow(id: string, name: string, phone: string | null, f: PersonFacts): PersonRow {
  const verdict = classifyStudent({
    isPremium: f.isPremium,
    hasBuddy: f.hasBuddy,
    paymentStuck: f.paymentStuck,
    wantsBuddy: f.wantsBuddy,
    activeRecently: f.daysSinceLog != null && f.daysSinceLog <= 3,
    hasPlan: f.hasPlan,
    daysSinceLog: f.daysSinceLog,
  });
  return {
    id, name, phone,
    sub: deriveSubscription(f),
    buddy: deriveBuddy(f),
    activity: deriveActivity(f.daysSinceLog),
    priority: verdict.priority,
    reason: verdict.reason,
  };
}

// ── The combinable filter ───────────────────────────────────────────────────

export interface PeopleFilter {
  sub?: SubState;
  buddy?: BuddyState;
  activity?: ActivityState;
}

/** AND across whichever dimensions are set. An unset dimension does not filter. */
export function matches(row: PersonRow, f: PeopleFilter): boolean {
  if (f.sub && row.sub !== f.sub) return false;
  if (f.buddy && row.buddy !== f.buddy) return false;
  if (f.activity && row.activity !== f.activity) return false;
  return true;
}

const RANK: Record<Priority, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

/**
 * Apply the filter and sort by BUSINESS priority — revenue-at-risk first,
 * never alphabetical. Ties break by name only so the order is stable.
 */
export function applyFilter(rows: PersonRow[], f: PeopleFilter): PersonRow[] {
  return rows
    .filter((r) => matches(r, f))
    .sort((a, b) => RANK[a.priority] - RANK[b.priority] || a.name.localeCompare(b.name));
}

/** Parse a URL searchParams object into a validated filter. */
export function parseFilter(params: { sub?: string; buddy?: string; activity?: string }): PeopleFilter {
  const sub = (['premium', 'payment_pending', 'payment_failed', 'expired', 'free'] as SubState[]).find((v) => v === params.sub);
  const buddy = (['assigned', 'wants', 'none'] as BuddyState[]).find((v) => v === params.buddy);
  const activity = (['today', 'yesterday', 'this_week', 'going_cold', 'inactive'] as ActivityState[]).find((v) => v === params.activity);
  return { sub, buddy, activity };
}

/** A URL that reflects toggling one dimension value on the current filter. */
export function toggledHref(base: string, current: PeopleFilter, dim: keyof PeopleFilter, value: string): string {
  const next: Record<string, string | undefined> = { ...current };
  next[dim] = current[dim] === value ? undefined : value; // click the active one to clear it
  const qs = Object.entries(next).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');
  return qs ? `${base}?${qs}` : base;
}
