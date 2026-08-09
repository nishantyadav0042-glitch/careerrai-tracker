import {
  getRealStudents, getGoingCold, getSalesReadyToCall, getWantsBuddy, type RealStudent,
} from '@/lib/admin-filters';
import { getStreakBreakers } from '@/lib/streak-breakers';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── The Founder Inbox — work, not charts ────────────────────────────────────
//
// Co-founder review, 9 Aug: "Stop thinking of pages. Start thinking of
// decisions. Every widget should end with 'what should Nishant do?' Forget
// dashboard — think inbox. When I clear the inbox, CareerRai is healthy."
//
// So this is not a dashboard module. It assembles the SYSTEM'S open work into
// one list. Every item carries a count, the money or the risk attached, and
// the single action that clears it. "127 students" is not an item; "12 premium
// students have no buddy — assign" is.
//
// Two hard rules, both to keep this from becoming an ERP:
//   1. Every item MUST have an action route. An item you cannot act on is a
//      chart, and this file does not do charts. A guard test enforces it.
//   2. Nothing is invented. Every number below comes from a real query. Where a
//      thing the review asked for cannot be computed honestly today — "review
//      today's AI cost", because Gemini token usage has never been stored — it
//      is omitted, not faked. A confident wrong number is worse than a gap.

export type Severity = 'critical' | 'high' | 'normal';

export interface InboxItem {
  id: string;
  /** The decision, with its count/₹ baked in. */
  title: string;
  /** Why it matters — the "so what". */
  why: string;
  /** The one action that clears it. */
  action: string;
  route: string;
  count: number;
  severity: Severity;
}

export interface FounderInbox {
  items: InboxItem[];
  /** 0-100. 100 = nothing open. Clicking reveals `items` as the reasons. */
  score: number;
  generatedAtMs: number;
}

// How much each open item drags the Founder Score down, per unit, capped. The
// weights encode judgement: a paying student with no mentor is worse than a
// cold free student, because we already took their money.
const WEIGHT: Record<string, { per: number; cap: number }> = {
  paid_no_buddy:    { per: 6, cap: 30 },
  expired_sessions: { per: 5, cap: 20 },
  pending_payments: { per: 1, cap: 8 },
  ocr_unusable:     { per: 3, cap: 12 },
  mentor_no_room:   { per: 5, cap: 15 },
  wants_buddy:      { per: 2, cap: 16 },
  sales_ready:      { per: 1, cap: 10 },
  going_cold:       { per: 1, cap: 15 },
  streak_breakers:  { per: 1, cap: 8 },
};

export async function assembleFounderInbox(admin: Admin, nowMs: number): Promise<FounderInbox> {
  const students = await getRealStudents(admin);

  const [
    goingCold, salesReady, wantsBuddy, streakBreakers,
    paidNoBuddy, sessions, pendingPayments, timetables, buddies, assignments,
  ] = await Promise.all([
    getGoingCold(admin, students),
    getSalesReadyToCall(admin, students),
    getWantsBuddy(admin),
    getStreakBreakers(admin),
    // Paying students with no mentor — the single worst state in the system.
    admin.from('profiles')
      .select('id')
      .eq('role', 'student').eq('is_premium', true).is('buddy_id', null)
      .not('is_test_account', 'is', true),
    // Sessions expired in the last 3 days — nobody joined a booked call.
    admin.from('video_sessions')
      .select('id, scheduled_at, session_status')
      .eq('session_status', 'expired')
      .gte('scheduled_at', new Date(nowMs - 3 * 86_400_000).toISOString()),
    // Orders stuck between created and paid — money we may be owed and can't see.
    admin.from('student_payments')
      .select('id, amount, status, created_at')
      .eq('status', 'created')
      .gte('created_at', new Date(nowMs - 7 * 86_400_000).toISOString()),
    // Confirmed timetables where nothing mapped — a plan ignoring the coaching.
    admin.from('student_timetables').select('student_id, blocks, confirmed_at'),
    // Mentors with students but no room — they literally cannot book a session.
    admin.from('profiles')
      .select('id, buddy_meet_url')
      .eq('role', 'buddy').not('is_test_account', 'is', true),
    // Student→buddy assignments, to know which mentors are actually loaded.
    // RealStudent does not carry buddy_id, so this is read directly rather than
    // derived from a type that does not have the field.
    admin.from('profiles')
      .select('buddy_id')
      .eq('role', 'student').not('buddy_id', 'is', null),
  ]);

  const paidNoBuddyN = (paidNoBuddy.data ?? []).length;
  const expiredN = (sessions.data ?? []).length;
  const pendingRows = pendingPayments.data ?? [];
  const pendingN = pendingRows.length;
  const pendingValue = Math.round(pendingRows.reduce((s: number, p: any) => s + (p.amount ?? 0), 0) / 100);

  const unusable = (timetables.data ?? []).filter((t: any) => {
    if (!t.confirmed_at) return false;
    const blocks = Array.isArray(t.blocks) ? t.blocks : [];
    return blocks.length > 0 && blocks.every((b: any) => !b.topic);
  }).length;

  const roomless = (buddies.data ?? []).filter((b: any) => !b.buddy_meet_url).map((b: any) => b.id);
  const loadByBuddy = new Map<string, number>();
  for (const a of assignments.data ?? []) {
    const bid = a.buddy_id as string;
    loadByBuddy.set(bid, (loadByBuddy.get(bid) ?? 0) + 1);
  }
  const mentorNoRoom = roomless.filter((id: string) => (loadByBuddy.get(id) ?? 0) > 0).length;

  const raw: (Omit<InboxItem, 'id'> & { id: string; key: string })[] = [
    {
      key: 'paid_no_buddy', id: 'paid_no_buddy',
      title: `${paidNoBuddyN} paying student${paidNoBuddyN === 1 ? '' : 's'} with no mentor`,
      why: 'They paid for a 1:1 mentor and have none assigned — the worst possible first week.',
      action: 'Assign a mentor', route: '/admin/people?sub=premium&buddy=none', count: paidNoBuddyN, severity: 'critical',
    },
    {
      key: 'mentor_no_room', id: 'mentor_no_room',
      title: `${mentorNoRoom} mentor${mentorNoRoom === 1 ? '' : 's'} cannot run a session`,
      why: 'Students assigned but no meeting room set — booking is refused until it is.',
      action: 'Set their room', route: '/admin/buddies', count: mentorNoRoom, severity: 'critical',
    },
    {
      key: 'expired_sessions', id: 'expired_sessions',
      title: `${expiredN} session${expiredN === 1 ? '' : 's'} expired with nobody joining`,
      why: 'A booked call where neither side joined in the last 3 days — a paid promise missed.',
      action: 'Review and rebook', route: '/admin/buddies/sessions', count: expiredN, severity: 'high',
    },
    {
      key: 'pending_payments', id: 'pending_payments',
      title: `${pendingN} abandoned checkout${pendingN === 1 ? '' : 's'} — ₹${pendingValue} in carts`,
      why: 'Opened checkout and left without paying. A real payment would have been auto-confirmed by reconcile, so these are sales follow-ups, not stuck money.',
      action: 'Follow up', route: '/admin/sales-queue', count: pendingN, severity: 'normal',
    },
    {
      key: 'ocr_unusable', id: 'ocr_unusable',
      title: `${unusable} coaching plan${unusable === 1 ? '' : 's'} ignoring the timetable`,
      why: 'The photo was read but nothing matched a CAT topic, so the plan is not following the coaching.',
      action: 'Fix the mapping', route: '/admin/ocr', count: unusable, severity: 'high',
    },
    {
      key: 'wants_buddy', id: 'wants_buddy',
      title: `${wantsBuddy.length} student${wantsBuddy.length === 1 ? '' : 's'} asked for a mentor`,
      why: 'Said yes to a mentor at signup, still free and unassigned — the hottest sales list you have.',
      action: 'Call them', route: '/admin/people?buddy=wants&sub=free', count: wantsBuddy.length, severity: 'high',
    },
    {
      key: 'sales_ready', id: 'sales_ready',
      title: `${salesReady.length} sales-ready student${salesReady.length === 1 ? '' : 's'} to call`,
      why: 'Engaged, never called, still free — warm and waiting.',
      action: 'Open the call queue', route: '/admin/sales-queue', count: salesReady.length, severity: 'normal',
    },
    {
      key: 'going_cold', id: 'going_cold',
      title: `${goingCold.length} student${goingCold.length === 1 ? '' : 's'} going cold`,
      why: 'No log in 4+ days — the strongest churn signal we can see today.',
      action: 'Send a nudge', route: '/admin/people?activity=going_cold', count: goingCold.length, severity: 'normal',
    },
    {
      key: 'streak_breakers', id: 'streak_breakers',
      title: `${streakBreakers.length} student${streakBreakers.length === 1 ? '' : 's'} broke their streak yesterday`,
      why: 'A shield caught yesterday, but they are silent today — a day from real churn.',
      action: 'Win them back', route: '/admin/streak-breakers', count: streakBreakers.length, severity: 'normal',
    },
  ];

  // Only OPEN work appears. A cleared item is not shown — an empty inbox is the
  // goal, and a list of zeros is just a dashboard wearing an inbox's clothes.
  const items: InboxItem[] = raw
    .filter((r) => r.count > 0)
    .map(({ key, ...item }) => { void key; return item; })
    .sort((a, b) => {
      const rank = { critical: 0, high: 1, normal: 2 };
      if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
      return b.count - a.count;
    });

  // The score. 100 minus the weighted, capped drag of every open item. A single
  // number in the morning; the reasons are the inbox itself.
  let penalty = 0;
  for (const r of raw) {
    const w = WEIGHT[r.key];
    if (w) penalty += Math.min(w.cap, r.count * w.per);
  }
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty)));

  return { items, score, generatedAtMs: nowMs };
}
