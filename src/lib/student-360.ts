import { getStudentMomentum, type StudentMomentum } from '@/lib/momentum';
import { computeCapacity, type Capacity } from '@/lib/capacity-engine';
import { computeAdaptation, type Adaptation, ADAPTATION_WINDOW_DAYS } from '@/lib/adaptation-engine';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Student 360 — one page, the complete story of one student. When the (one)
// salesperson is about to call 1 of 25, she needs the whole history on a single
// screen: how they came in, what they've done, whether we can reach them, how
// hot they are, and the single recommended next action. The most valuable page
// in the admin (founder + both advisors agreed) — and it's just a merge of
// tables we already have.

export interface TimelineEvent { ts: number; iso: string; icon: string; label: string; kind: 'signup' | 'study' | 'notif' | 'intent' | 'sales' | 'money' | 'mentor' }

export interface Student360 {
  profile: {
    id: string; full_name: string | null; phone: string | null;
    isPremium: boolean; hasBuddy: boolean; appInstalled: boolean;
    createdAt: string | null; joinedDaysAgo: number | null;
  };
  reach: {
    prefsPush: boolean; hasLiveSub: boolean; context: string | null;
    verifiedDaysAgo: number | null; diedDaysAgo: number | null;
  };
  momentum: StudentMomentum;
  facts: { logsTotal: number; lastLogDate: string | null; opensPush: boolean };
  capacity: Capacity;
  adaptation: Adaptation;
  timeline: TimelineEvent[];
}

const DAY = 86_400_000;
const daysAgo = (iso: string | null | undefined, now: number) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null;

export async function getStudent360(admin: any, id: string): Promise<Student360 | null> {
  const now = Date.now();
  const windowStart = new Date(now - ADAPTATION_WINDOW_DAYS * DAY).toISOString().slice(0, 10);
  const [{ data: p }, momentum, { data: reports }, { data: notifs }, { data: eng }, { data: grants }, { data: winRoutines }, { data: winCompletions }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, is_premium, buddy_id, app_installed, created_at, premium_since, notif_prefs, push_subscription, push_context, push_verified_at, push_died_at, study_target_hours, hours_available').eq('id', id).single(),
    getStudentMomentum(admin, id),
    admin.from('daily_reports').select('report_date, created_at, study_duration, plan_fit').eq('student_id', id).order('report_date', { ascending: false }),
    admin.from('notifications').select('type, title, pushed_at, clicked_at').eq('user_id', id).not('pushed_at', 'is', null).order('pushed_at', { ascending: false }).limit(200),
    admin.from('student_engagement').select('signed_up_at, buddy_cta_last_at, intent_door_at, sales_called_at, mock_opened').eq('student_id', id).maybeSingle(),
    admin.from('mentor_grants').select('door, created_at').eq('student_id', id),
    // Adaptation input: plan-day completion over the recent window.
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', id).gte('routine_date', windowStart),
    admin.from('routine_task_completions').select('routine_date, task_id').eq('student_id', id).gte('routine_date', windowStart),
  ]);
  if (!p || !momentum) return null;

  const e = (eng ?? {}) as any;
  const events: TimelineEvent[] = [];
  const add = (iso: string | null | undefined, icon: string, label: string, kind: TimelineEvent['kind']) => {
    if (!iso) return;
    events.push({ ts: new Date(iso).getTime(), iso, icon, label, kind });
  };

  add(p.created_at, '📝', 'Signed up', 'signup');
  add(p.premium_since, '💳', 'Went premium', 'money');
  add(e.buddy_cta_last_at, '💛', 'Reached for a buddy', 'intent');
  add(e.intent_door_at, '🚪', 'Crossed the intent door (2nd buddy tap)', 'intent');
  add(e.sales_called_at, '📞', 'Sales called', 'sales');
  for (const g of grants ?? []) add(g.created_at, '🚪', `Mentor door crossed (${g.door})`, 'mentor');
  // Logs — cap to the most recent 25 so the timeline stays readable.
  for (const r of (reports ?? []).slice(0, 25)) add(r.created_at ?? `${r.report_date}T12:00:00+05:30`, '✅', `Logged study (${r.report_date})`, 'study');
  // Opened pushes are the real engagement signal; ignore the sent-but-unopened noise here.
  for (const n of (notifs ?? []).filter((x: any) => x.clicked_at).slice(0, 20)) add(n.clicked_at, '🔔', `Opened: ${n.title ?? n.type}`, 'notif');

  events.sort((a, b) => b.ts - a.ts);

  return {
    profile: {
      id: p.id, full_name: p.full_name ?? null, phone: p.phone ?? null,
      isPremium: p.is_premium === true, hasBuddy: p.buddy_id != null, appInstalled: p.app_installed === true,
      createdAt: p.created_at ?? null, joinedDaysAgo: daysAgo(p.created_at, now),
    },
    reach: {
      prefsPush: (p.notif_prefs as { push?: boolean } | null)?.push === true,
      hasLiveSub: p.push_subscription != null,
      context: (p.push_context as string | null) ?? null,
      verifiedDaysAgo: daysAgo(p.push_verified_at, now),
      diedDaysAgo: daysAgo(p.push_died_at, now),
    },
    momentum,
    facts: {
      logsTotal: (reports ?? []).length,
      lastLogDate: (reports ?? [])[0]?.report_date ?? null,
      opensPush: momentum.signals.openedPushRecently,
    },
    capacity: (() => {
      const win = (reports ?? []).filter((r: any) => r.report_date >= windowStart);
      const hrs = win.map((r: any) => Number(r.study_duration) || 0);
      return computeCapacity(hrs, win.length, (p.study_target_hours ?? p.hours_available) as number | null);
    })(),
    adaptation: (() => {
      const win = (reports ?? []).filter((r: any) => r.report_date >= windowStart);
      const planFits = win.map((r: any) => r.plan_fit).filter((f: any): f is string => typeof f === 'string');
      const completedByDate = new Map<string, Set<string>>();
      for (const c of winCompletions ?? []) {
        if (!completedByDate.has(c.routine_date)) completedByDate.set(c.routine_date, new Set());
        completedByDate.get(c.routine_date)!.add(c.task_id);
      }
      const todayStr = new Date(now).toISOString().slice(0, 10);
      let completedTasks = 0, plannedTasks = 0, planDays = 0;
      for (const r of winRoutines ?? []) {
        const taskCount = Array.isArray(r.tasks) ? (r.tasks as unknown[]).length : 0;
        if (r.routine_date < todayStr && taskCount > 0) {
          planDays++;
          plannedTasks += taskCount;
          completedTasks += Math.min(taskCount, (completedByDate.get(r.routine_date) ?? new Set()).size);
        }
      }
      return computeAdaptation(planFits, completedTasks, plannedTasks, planDays);
    })(),
    timeline: events.slice(0, 60),
  };
}
