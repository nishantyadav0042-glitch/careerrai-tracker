import { MENTOR_OVERLOAD_THRESHOLD } from './scale-config';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── Mentor Operations — mentors requiring action, nothing else ──────────────
//
// Founder, 9 Aug: "Don't build a Mentors page. Build Mentor Operations.
// Default: mentors requiring action — 6. Healthy mentors disappear."
//
// The People/Revenue law, applied to mentor supply. A mentor doing their job
// with a room set and no missed sessions is invisible. Only the ones needing a
// human surface — can't run a session (no room), a missed session, an overload,
// a payout pending — priority-ranked, each with an action, opening the buddy
// 360. The "available for assignment" set is included at the bottom, because at
// scale the founder's action there is "who can take this premium student".

export type MentorState =
  | 'cant_run_session'   // has students, no meeting room — booking is refused
  | 'session_missed'     // a booked session expired, nobody joined
  | 'overloaded'         // more students than one mentor should carry
  | 'payout_pending'     // owed money, not yet paid
  | 'available';         // room set, capacity free — for assignment

export const MENTOR_META: Record<MentorState, { label: string; tone: 'red' | 'amber' | 'stone' | 'green'; priority: 0 | 1 | 2 | 3 }> = {
  cant_run_session: { label: 'Cannot run a session', tone: 'red', priority: 0 },
  session_missed:   { label: 'Session missed', tone: 'amber', priority: 1 },
  overloaded:       { label: 'Overloaded', tone: 'amber', priority: 1 },
  payout_pending:   { label: 'Payout pending', tone: 'stone', priority: 2 },
  available:        { label: 'Available', tone: 'green', priority: 3 },
};

/** One mentor should not carry more than this before it needs a look.
 *  Sourced from scale-config so the comfort line is business config, not UI. */
export const OVERLOAD_THRESHOLD = MENTOR_OVERLOAD_THRESHOLD;

export interface MentorItem {
  id: string;
  name: string;
  phone: string | null;
  state: MentorState;
  students: number;
  detail: string;
  route: string;
}

export interface MentorOps {
  /** Mentors needing action — the default view. */
  items: MentorItem[];
  /** Total mentors, for the "all" context. */
  totalMentors: number;
}

export async function assembleMentorOps(admin: Admin, nowMs: number): Promise<MentorOps> {
  const [{ data: buddies }, { data: assignments }, { data: sessions }, { data: payouts }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, buddy_meet_url, buddy_onboarding_completed')
      .eq('role', 'buddy').not('is_test_account', 'is', true),
    admin.from('profiles').select('buddy_id').eq('role', 'student').not('buddy_id', 'is', null),
    admin.from('video_sessions')
      .select('buddy_id, session_status, scheduled_at')
      .eq('session_status', 'expired')
      .gte('scheduled_at', new Date(nowMs - 3 * 86_400_000).toISOString()),
    admin.from('buddy_payouts').select('buddy_id, agreed_amount').eq('status', 'pending'),
  ]);

  const load = new Map<string, number>();
  for (const a of assignments ?? []) load.set(a.buddy_id as string, (load.get(a.buddy_id as string) ?? 0) + 1);

  const missedBy = new Map<string, number>();
  for (const s of sessions ?? []) missedBy.set(s.buddy_id as string, (missedBy.get(s.buddy_id as string) ?? 0) + 1);

  const payoutBy = new Set((payouts ?? []).map((p: any) => p.buddy_id));

  const items: MentorItem[] = [];
  for (const b of buddies ?? []) {
    const students = load.get(b.id) ?? 0;
    const hasRoom = !!b.buddy_meet_url;
    const missed = missedBy.get(b.id) ?? 0;
    const name = (b.full_name as string) ?? 'Mentor';
    const route = `/admin/buddy/${b.id}`;

    // ONE state per mentor — the most urgent thing true about them. Order is
    // the priority: a blocked mentor is not also listed as "available".
    if (students > 0 && !hasRoom) {
      items.push({ id: b.id, name, phone: b.phone ?? null, state: 'cant_run_session', students,
        detail: `${students} student${students === 1 ? '' : 's'} assigned, no meeting room — booking is refused until one is set.`, route });
    } else if (missed > 0) {
      items.push({ id: b.id, name, phone: b.phone ?? null, state: 'session_missed', students,
        detail: `${missed} session${missed === 1 ? '' : 's'} expired in the last 3 days — nobody joined.`, route });
    } else if (students >= OVERLOAD_THRESHOLD) {
      items.push({ id: b.id, name, phone: b.phone ?? null, state: 'overloaded', students,
        detail: `${students} students — over the ${OVERLOAD_THRESHOLD}-student comfort line. Consider rebalancing.`, route });
    } else if (payoutBy.has(b.id)) {
      items.push({ id: b.id, name, phone: b.phone ?? null, state: 'payout_pending', students,
        detail: 'A payout is pending — settle it.', route });
    } else if (hasRoom && b.buddy_onboarding_completed === true) {
      items.push({ id: b.id, name, phone: b.phone ?? null, state: 'available', students,
        detail: students === 0 ? 'Room set, no students — free to take an assignment.' : `Room set, ${students} student${students === 1 ? '' : 's'} — has capacity.`, route });
    }
    // A fully-healthy mentor with no room-need, no misses, not overloaded, no
    // payout and not flagged available (e.g. setup incomplete) simply does not
    // appear — the whole point.
  }

  items.sort((a, b) => MENTOR_META[a.state].priority - MENTOR_META[b.state].priority || b.students - a.students);

  return { items, totalMentors: (buddies ?? []).length };
}
