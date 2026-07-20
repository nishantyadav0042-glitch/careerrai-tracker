import { getLogDateString, liveStreak, momentumStreak, daysSinceLastLog, MS_PER_DAY } from '@/lib/streak-utils';

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
//   Sales-ready        → engagement.sales_ready, never called, still free.
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
export async function getRealStudents(admin: any): Promise<RealStudent[]> {
  const { data } = await admin
    .from('profiles')
    .select('id, full_name, phone, onboarding_completed')
    .eq('role', 'student')
    .not('is_test_account', 'is', true)
    .not('is_demo', 'is', true);
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
    admin.from('daily_reports').select('student_id, created_at').eq('report_date', logDay).order('created_at', { ascending: false }),
    admin.from('streak_data').select('student_id, current_streak, last_log_date'),
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
  const { data: streaks } = await admin.from('streak_data').select('student_id, current_streak, last_log_date, shields');
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
    admin.from('daily_reports').select('student_id').eq('report_date', logDay),
    admin.from('streak_data').select('student_id, last_log_date'),
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
  const { data: streaks } = await admin.from('streak_data').select('student_id, last_log_date');
  const rows: GoingColdRow[] = [];
  for (const st of streaks ?? []) {
    const s = byId.get(st.student_id as string);
    if (!s || !st.last_log_date) continue;
    const days = daysSinceLastLog(st.last_log_date as string);
    if (days != null && days >= 4) rows.push({ ...s, lastLogDate: st.last_log_date as string, daysSince: days });
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

export async function getSalesReadyToCall(admin: any, students?: RealStudent[]): Promise<SalesReadyRow[]> {
  const base = students ?? (await getRealStudents(admin));
  const byId = new Map(base.map((s) => [s.id, s]));
  const { data: rows } = await admin
    .from('student_engagement')
    .select('student_id, buddy_cta_clicks, mock_opened, signed_up_at')
    .eq('sales_ready', true)
    .is('sales_called_at', null)
    .limit(1000);
  const ids = (rows ?? []).map((r: any) => r.student_id as string).filter((id: string) => byId.has(id));
  if (ids.length === 0) return [];
  const [{ data: profs }, { data: streaks }, { data: doors }] = await Promise.all([
    admin.from('profiles').select('id, is_premium').in('id', ids),
    admin.from('streak_data').select('student_id, current_streak, last_log_date, shields').in('student_id', ids),
    admin.from('mentor_grants').select('student_id, door').in('student_id', ids),
  ]);
  const premiumIds = new Set((profs ?? []).filter((p: any) => p.is_premium === true).map((p: any) => p.id as string));
  const streakById = new Map((streaks ?? []).map((s: any) => [s.student_id, s]));
  const doorById = new Map((doors ?? []).map((d: any) => [d.student_id as string, d.door as 'history' | 'intent']));
  return (rows ?? [])
    .filter((r: any) => byId.has(r.student_id) && !premiumIds.has(r.student_id))
    .map((r: any) => {
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

export { MS_PER_DAY };
