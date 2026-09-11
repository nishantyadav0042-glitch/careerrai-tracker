import { getLogDateString, liveStreak, momentumStreak, daysSinceLastLog, MS_PER_DAY } from '@/lib/streak-utils';
import { GOING_COLD_DAYS } from '@/lib/os/people-filter';
import { CALL_OUTCOMES } from '@/lib/sales-disposition';

import { fetchAll } from '@/lib/supabase/fetch-all';
// ── The dashboard's single source of truth ───────────────────────────────────
//
// Founder rule (20 July): every dashboard card is ONE precise filter. The
// count on the card and the list behind it come from the SAME function — the
// count is literally `list.length`, so they can never disagree. No card may
// include a student because they are "similar" or "might need attention";
// membership is a deterministic WHERE clause.
//
// Base population for every card: REAL students — role='student', not a test
// account, not the demo account. The flag checks are NULL-safe (`IS NOT TRUE`,
// via .not(col,'is',true)) so a future NULL in either column can never
// silently change a filter's meaning (Postgres `col <> true` drops NULLs).
//
// Card definitions (ratified):
//   Logged today       → has a daily_report dated today (3 AM IST log-day).
//   Live streaks       → stored streak ≥1 AND last log today or yesterday.
//   Remind to log      → onboarded, has NOT logged today.
//   Streak breakers    → lib/streak-breakers.ts (logged day-before-yesterday,
//                        skipped yesterday, silent today) — already shared.
//   Sales-ready        → engagement.sales_ready, no call disposition in
//                        sales_activity yet (SA-1C drain), still free.
//   Going cold         → last log 4+ days ago.

/* eslint-disable @typescript-eslint/no-explicit-any */

export interface RealStudent {
  id: string;
  full_name: string | null;
  phone: string | null;
  onboarding_completed: boolean | null;
}

// One fetch of the base population, reused by the filters below within a
// request. Every card derives from this exact set.
//
// A FAILED READ THROWS. It must not return an empty population, and `data ??
// []` did exactly that: `fetchAll` reports a failure in `error` and leaves
// `data` null, so a timeout on page three rendered as zero students, every
// Founder Inbox card empty, and "All clear" at the top of the screen. That is
// the same shape as Incident #65 itself — an absent value presenting itself as
// a valid one — only louder in its consequences, because a truncated roster
// still looks like a roster while an empty one reads as a calm day.
//
// Every card here derives from this list, so there is no safe partial answer:
// the page failing is strictly better than the page lying.
export async function getRealStudents(admin: any): Promise<RealStudent[]> {
  const { data, error } = await fetchAll(() => admin
    .from('profiles')
    .select('id, full_name, phone, onboarding_completed')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true));
  if (error) throw new Error(`getRealStudents failed: ${error.message}`);
  return (data ?? []) as RealStudent[];
}

export interface LoggedTodayRow extends RealStudent {
  loggedAtIso: string;
  streak: number; // live streak (they logged today, so stored value IS live)
}

export async function getLoggedToday(admin: any, students?: RealStudent[]): Promise<LoggedTodayRow[]> {
  const logDay = getLogDateString();
  const base = students ?? (await getRealStudents(admin));
  const byId = new Map(base.map((s) => [s.id, s]));
  const [{ data: reports }, { data: streaks }] = await Promise.all([
    fetchAll(() => admin.from('daily_reports').select('student_id, created_at').eq('report_date', logDay), { orderBy: 'created_at', ascending: false }),
    fetchAll(() => admin.from('streak_data').select('student_id, current_streak, last_log_date')),
  ]);
  const streakById = new Map((streaks ?? []).map((s: any) => [s.student_id, s]));
  const seen = new Set<string>();
  const rows: LoggedTodayRow[] = [];
  for (const r of reports ?? []) {
    const s = byId.get(r.student_id as string);
    if (!s || seen.has(s.id)) continue;
    seen.add(s.id);
    const st = streakById.get(s.id) as any;
    rows.push({ ...s, loggedAtIso: r.created_at as string, streak: liveStreak(st?.current_streak, st?.last_log_date) });
  }
  return rows;
}

export interface LiveStreakRow extends RealStudent {
  streak: number;       // momentum streak (after pending shield/decay math)
  shields: number;      // shields remaining after covering pending misses
  lastLogDate: string;
  active: boolean;      // logged today/yesterday; false = alive only because shields/decay protect it
}

// "Streaks alive": every student whose MOMENTUM streak is ≥1 right now — the
// actively-logging AND the shield-protected (missed days covered by shields or
// still surviving decay). Deterministic: momentumStreak(stored, shields,
// last_log) ≥ 1.
export async function getStreaksAlive(admin: any, students?: RealStudent[]): Promise<LiveStreakRow[]> {
  const base = students ?? (await getRealStudents(admin));
  const byId = new Map(base.map((s) => [s.id, s]));
  const { data: streaks } = await fetchAll(() => admin.from('streak_data').select('student_id, current_streak, last_log_date, shields'));
  const rows: LiveStreakRow[] = [];
  for (const st of streaks ?? []) {
    const s = byId.get(st.student_id as string);
    if (!s || !st.last_log_date) continue;
    const m = momentumStreak(st.current_streak as number | null, st.shields as number | null, st.last_log_date as string | null);
    if (m.streak >= 1) {
      rows.push({
        ...s,
        streak: m.streak,
        shields: m.shields,
        lastLogDate: st.last_log_date as string,
        active: liveStreak(st.current_streak as number | null, st.last_log_date as string | null) >= 1,
      });
    }
  }
  return rows.sort((a, b) => Number(b.active) - Number(a.active) || b.streak - a.streak);
}

export interface RemindRow extends RealStudent {
  lastLogDate: string | null; // null = never logged
}

export async function getRemindToLog(admin: any, students?: RealStudent[]): Promise<RemindRow[]> {
  const logDay = getLogDateString();
  const base = students ?? (await getRealStudents(admin));
  const [{ data: todayLogs }, { data: streaks }] = await Promise.all([
    fetchAll(() => admin.from('daily_reports').select('student_id').eq('report_date', logDay)),
    fetchAll(() => admin.from('streak_data').select('student_id, last_log_date')),
  ]);
  const loggedIds = new Set((todayLogs ?? []).map((r: any) => r.student_id as string));
  const lastById = new Map<string, string | null>((streaks ?? []).map((s: any) => [s.student_id as string, (s.last_log_date as string | null) ?? null]));
  return base
    .filter((s) => s.onboarding_completed === true && !loggedIds.has(s.id))
    .map((s) => ({ ...s, lastLogDate: lastById.get(s.id) ?? null }))
    // Logged-before first (highest intent), then most recent activity.
    .sort((a, b) => Number(b.lastLogDate != null) - Number(a.lastLogDate != null) || (b.lastLogDate ?? '').localeCompare(a.lastLogDate ?? ''));
}

export interface GoingColdRow extends RealStudent {
  lastLogDate: string;
  daysSince: number;
}

export async function getGoingCold(admin: any, students?: RealStudent[]): Promise<GoingColdRow[]> {
  const base = students ?? (await getRealStudents(admin));
  const byId = new Map(base.map((s) => [s.id, s]));
  const { data: streaks } = await fetchAll(() => admin.from('streak_data').select('student_id, last_log_date'));
  const rows: GoingColdRow[] = [];
  for (const st of streaks ?? []) {
    const s = byId.get(st.student_id as string);
    if (!s || !st.last_log_date) continue;
    const days = daysSinceLastLog(st.last_log_date as string);
    if (days != null && days >= GOING_COLD_DAYS) rows.push({ ...s, lastLogDate: st.last_log_date as string, daysSince: days });
  }
  return rows.sort((a, b) => a.daysSince - b.daysSince);
}

export interface SalesReadyRow extends RealStudent {
  buddy_cta_clicks: number;
  mock_opened: boolean;
  signed_up_at: string | null;
  streak: number;               // momentum streak
  lastLogDays: number | null;   // null = never logged
  mentorDoor: 'history' | 'intent' | null; // crossed a free-mentor door (dormant until enabled)
}

// SA-1C (20 Aug 2026): the drain. This list used to filter on
// sales_called_at IS NULL — a column NOTHING ever wrote, so the list could
// only grow (363 flagged, 0 ever cleared; forensic finding P1-D). The drain
// is now the call HISTORY: a student leaves this list once a sales_activity
// row exists whose status is one of the five call dispositions
// (CALL_OUTCOMES in lib/sales-disposition). That definition is deliberate:
// a no-answer attempt ALSO drains, because that student is now inside the
// cadence loop (lead_outreach.next_action_at) and surfaces in the calling
// queue — showing them here too would be the same student on two lists.
// Future non-call activity (a reassignment, a note) uses other status
// values and must NOT drain; importing the vocabulary keeps that boundary
// in one place.
export async function getSalesReadyToCall(admin: any, students?: RealStudent[]): Promise<SalesReadyRow[]> {
  const base = students ?? (await getRealStudents(admin));
  const byId = new Map(base.map((s) => [s.id, s]));
  const { data: rows } = await fetchAll(() => admin
    .from('student_engagement')
    .select('student_id, buddy_cta_clicks, mock_opened, signed_up_at')
    .eq('sales_ready', true), { orderBy: 'student_id' });
  const flagged = (rows ?? []).map((r: any) => r.student_id as string).filter((id: string) => byId.has(id));
  if (flagged.length === 0) return [];
  const { data: worked } = await admin
    .from('sales_activity')
    .select('student_id')
    .in('student_id', flagged)
    .in('status', CALL_OUTCOMES as unknown as string[]);
  const workedIds = new Set((worked ?? []).map((w: any) => w.student_id as string));
  const ids = flagged.filter((id: string) => !workedIds.has(id));
  if (ids.length === 0) return [];
  const [{ data: profs }, { data: streaks }, { data: doors }] = await Promise.all([
    admin.from('profiles').select('id, is_premium').in('id', ids),
    admin.from('streak_data').select('student_id, current_streak, last_log_date, shields').in('student_id', ids),
    admin.from('mentor_grants').select('student_id, door').in('student_id', ids),
  ]);
  const premiumIds = new Set((profs ?? []).filter((p: any) => p.is_premium === true).map((p: any) => p.id as string));
  const streakById = new Map<string, any>((streaks ?? []).map((s: any) => [s.student_id as string, s]));
  const doorById = new Map<string, 'history' | 'intent'>((doors ?? []).map((d: any) => [d.student_id as string, d.door as 'history' | 'intent']));
  return (rows ?? [])
    .filter((r: any) => byId.has(r.student_id) && !premiumIds.has(r.student_id))
    .map((r: any): SalesReadyRow => {
      const s = byId.get(r.student_id)!;
      const st = streakById.get(r.student_id) as any;
      return {
        ...s,
        buddy_cta_clicks: (r.buddy_cta_clicks as number | null) ?? 0,
        mock_opened: r.mock_opened === true,
        signed_up_at: (r.signed_up_at as string | null) ?? null,
        streak: momentumStreak(st?.current_streak, st?.shields, st?.last_log_date).streak,
        lastLogDays: daysSinceLastLog(st?.last_log_date),
        mentorDoor: doorById.get(r.student_id) ?? null,
      };
    })
    // Hottest first, honestly: unlock clicks, then a LIVE streak, then freshest activity.
    .sort((a: SalesReadyRow, b: SalesReadyRow) =>
      (b.buddy_cta_clicks - a.buddy_cta_clicks) || (b.streak - a.streak) || ((a.lastLogDays ?? 999) - (b.lastLogDays ?? 999)));
}

export interface WantsBuddyRow {
  id: string;
  full_name: string | null;
  phone: string | null;
  created_at: string;
  app_installed: boolean;
  buddy_cta_clicks: number;
  streak: number;               // momentum streak
  lastLogDays: number | null;   // null = never logged
  mentorDoor: 'history' | 'intent' | null;
}

// "Wants a buddy" (founder, 21 July): students who EXPLICITLY answered yes to
// the mentor question in onboarding, still free, still unassigned — a
// declared want, not an inferred one. Deterministic: wants_mentor = true AND
// buddy_id IS NULL AND not premium, real students only. Sorted hottest:
// unlock taps → live momentum streak → freshest activity → newest signup.
export async function getWantsBuddy(admin: any): Promise<WantsBuddyRow[]> {
  const { data: students } = await fetchAll(() => admin
    .from('profiles')
    .select('id, full_name, phone, created_at, app_installed')
    .eq('role', 'student')
    .eq('wants_mentor', true)
    .is('buddy_id', null)
    .not('is_premium', 'is', true)
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true));
  const ids = (students ?? []).map((s: any) => s.id as string);
  if (ids.length === 0) return [];
  const [{ data: eng }, { data: streaks }, { data: doors }] = await Promise.all([
    admin.from('student_engagement').select('student_id, buddy_cta_clicks').in('student_id', ids),
    admin.from('streak_data').select('student_id, current_streak, last_log_date, shields').in('student_id', ids),
    admin.from('mentor_grants').select('student_id, door').in('student_id', ids),
  ]);
  const engById = new Map<string, number>((eng ?? []).map((e: any) => [e.student_id as string, (e.buddy_cta_clicks as number | null) ?? 0]));
  const streakById = new Map<string, any>((streaks ?? []).map((s: any) => [s.student_id as string, s]));
  const doorById = new Map<string, 'history' | 'intent'>((doors ?? []).map((d: any) => [d.student_id as string, d.door as 'history' | 'intent']));
  return (students ?? [])
    .map((s: any): WantsBuddyRow => {
      const st = streakById.get(s.id) as any;
      return {
        id: s.id as string,
        full_name: (s.full_name as string | null) ?? null,
        phone: (s.phone as string | null) ?? null,
        created_at: s.created_at as string,
        app_installed: s.app_installed === true,
        buddy_cta_clicks: engById.get(s.id) ?? 0,
        streak: momentumStreak(st?.current_streak, st?.shields, st?.last_log_date).streak,
        lastLogDays: daysSinceLastLog(st?.last_log_date),
        mentorDoor: doorById.get(s.id) ?? null,
      };
    })
    .sort((a: WantsBuddyRow, b: WantsBuddyRow) =>
      (b.buddy_cta_clicks - a.buddy_cta_clicks)
      || (b.streak - a.streak)
      || ((a.lastLogDays ?? 999) - (b.lastLogDays ?? 999))
      || b.created_at.localeCompare(a.created_at));
}

export { MS_PER_DAY };
