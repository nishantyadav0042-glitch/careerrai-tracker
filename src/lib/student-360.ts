import { getStudentMomentum, type StudentMomentum } from '@/lib/momentum';
import { dailyHours } from '@/lib/daily-hours';
import { computeCapacity, type Capacity } from '@/lib/capacity-engine';
import { computeAdaptation, type Adaptation, ADAPTATION_WINDOW_DAYS } from '@/lib/adaptation-engine';
import { assembleIntelligence, type StudentIntelligence } from '@/lib/intelligence';
import { getPhase } from '@/lib/routine-engine';
import { weeksToExam } from '@/lib/study-plan';
import type { Blocker } from '@/lib/mission-engine';
import { getEntityTimeline } from '@/lib/os/timeline';
import { dayWasStudied } from '@/lib/check-in';

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
  intelligence: StudentIntelligence;
  timeline: TimelineEvent[];
}

const DAY = 86_400_000;
const daysAgo = (iso: string | null | undefined, now: number) =>
  iso ? Math.max(0, Math.floor((now - new Date(iso).getTime()) / DAY)) : null;

export async function getStudent360(admin: any, id: string): Promise<Student360 | null> {
  const now = Date.now();
  const windowStart = new Date(now - ADAPTATION_WINDOW_DAYS * DAY).toISOString().slice(0, 10);
  const [{ data: p }, momentum, { data: reports }, { data: notifs }, { data: eng }, { data: grants }, { data: winRoutines }, { data: winCompletions }, { data: coverageRows }, { data: debriefs }, decisions] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, is_premium, buddy_id, app_installed, created_at, premium_since, notif_prefs, push_subscription, push_context, push_verified_at, push_died_at, study_target_hours, hours_available, baseline_varc, baseline_dilr, baseline_qa, target_percentile, biggest_blocker, attempt_year, current_stage, is_repeater, is_working_professional').eq('id', id).single(),
    getStudentMomentum(admin, id),
    admin.from('daily_reports').select('report_date, created_at, study_duration, plan_fit, mock_taken, day_outcome').eq('student_id', id).order('report_date', { ascending: false }),
    admin.from('notifications').select('type, title, pushed_at, clicked_at').eq('user_id', id).not('pushed_at', 'is', null).order('pushed_at', { ascending: false }).limit(200),
    admin.from('student_engagement').select('signed_up_at, buddy_cta_last_at, intent_door_at, sales_called_at, mock_opened').eq('student_id', id).maybeSingle(),
    admin.from('mentor_grants').select('door, created_at').eq('student_id', id),
    // Adaptation + intelligence input: plan-day completion + per-section recency.
    admin.from('daily_routines').select('routine_date, tasks').eq('student_id', id).gte('routine_date', windowStart),
    admin.from('routine_task_completions').select('routine_date, task_id').eq('student_id', id).gte('routine_date', windowStart),
    // Constraint / Performance input: syllabus coverage snapshot.
    admin.from('topic_coverage').select('section, topic, status').eq('student_id', id),
    // Mock-pending signal: mocks analysed (debriefs) vs mocks logged.
    admin.from('mock_debriefs').select('taken_on').eq('student_id', id).order('taken_on', { ascending: false }).limit(10),
    // Decision timeline — subscribed, refunded, buddy assigned, session
    // expired, OCR failed — the moments the synthesized events above miss.
    getEntityTimeline(admin, 'student', id, 40),
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

  // Merge the decision timeline in. These are the "so what" moments —
  // subscribed, refunded, session expired — recorded on emit rather than
  // synthesized, so they are exact.
  const DECISION_ICON: Record<string, string> = {
    subscribed: '💳', refunded: '↩️', payment_stuck: '⚠️', buddy_assigned: '🤝',
    buddy_unassigned: '🔻', session_expired: '📵', ocr_failed: '📷', scholarship_granted: '🎁',
  };
  const DECISION_KIND: Record<string, TimelineEvent['kind']> = {
    subscribed: 'money', refunded: 'money', payment_stuck: 'money', scholarship_granted: 'money',
    buddy_assigned: 'mentor', buddy_unassigned: 'mentor', session_expired: 'mentor', ocr_failed: 'study',
  };
  for (const d of (decisions ?? [])) {
    add(d.createdAt, DECISION_ICON[d.kind] ?? '•', d.summary, DECISION_KIND[d.kind] ?? 'study');
  }

  events.sort((a, b) => b.ts - a.ts);

  // ── Learning-intelligence assembly, all off rows already fetched ──
  // Capacity → Adaptation → (Constraint + Performance → Coaching Decision).
  const todayStr = new Date(now).toISOString().slice(0, 10);
  const winReports = (reports ?? []).filter((r: any) => r.report_date >= windowStart);
  const hrs = winReports.map((r: any) => Number(r.study_duration) || 0);
  const capacity = computeCapacity(hrs, winReports.length, dailyHours(p).weekday);

  const completedByDate = new Map<string, Set<string>>();
  for (const c of winCompletions ?? []) {
    if (!completedByDate.has(c.routine_date)) completedByDate.set(c.routine_date, new Set());
    completedByDate.get(c.routine_date)!.add(c.task_id);
  }
  let completedTasks = 0, plannedTasks = 0, planDays = 0;
  const daysSinceSection: Record<string, number> = {};
  for (const r of winRoutines ?? []) {
    const tasks = Array.isArray(r.tasks) ? (r.tasks as any[]) : [];
    if (r.routine_date < todayStr && tasks.length > 0) {
      planDays++;
      plannedTasks += tasks.length;
      completedTasks += Math.min(tasks.length, (completedByDate.get(r.routine_date) ?? new Set()).size);
    }
    const done = completedByDate.get(r.routine_date) ?? new Set();
    const ago = Math.round((Date.parse(todayStr) - Date.parse(r.routine_date)) / DAY);
    for (const t of tasks) {
      if (!done.has(t.id)) continue;
      if (['VARC', 'DILR', 'QA'].includes(t.section) && (daysSinceSection[t.section] == null || ago < daysSinceSection[t.section])) daysSinceSection[t.section] = ago;
    }
  }
  const planFits = winReports.map((r: any) => r.plan_fit).filter((f: any): f is string => typeof f === 'string');
  const adaptation = computeAdaptation(planFits, completedTasks, plannedTasks, planDays);

  const tenAgo = new Date(now - 10 * DAY).toISOString().slice(0, 10);
  const twentyAgo = new Date(now - 20 * DAY).toISOString().slice(0, 10);
  let recentActive10 = 0, priorActive10 = 0;
  for (const r of winReports) {
    // A3 — the student's declared outcome counts as an active day even when
    // the hours column is 0 (a check-in never asks for hours). `hrs` above is
    // left alone deliberately: it feeds computeCapacity, a deferred consumer.
    if (!dayWasStudied(r)) continue;
    if (r.report_date > tenAgo) recentActive10++;
    else if (r.report_date > twentyAgo) priorActive10++;
  }
  const recencyVals = Object.values(daysSinceSection);
  const cov = (coverageRows ?? []) as { status: string }[];
  const coverage = cov.length > 0
    ? { total: cov.length, notStarted: cov.filter((r) => r.status === 'not_started').length, confident: cov.filter((r) => r.status === 'exam_ready' || r.status === 'mastered').length }
    : null;
  const debriefDates = new Set((debriefs ?? []).map((d: any) => d.taken_on));
  const lastMock = winReports.find((r: any) => r.mock_taken === true);
  const daysSincePendingMock = lastMock && !debriefDates.has(lastMock.report_date)
    ? Math.round((Date.parse(todayStr) - Date.parse(lastMock.report_date)) / DAY) : null;
  const baselines = [p.baseline_varc, p.baseline_dilr, p.baseline_qa].map((v: any) => v as number | null).filter((v): v is number => v != null);
  const capacityGapHours = capacity.claimedHours != null && capacity.sustainableHours != null
    ? Math.max(0, Math.round((capacity.claimedHours - capacity.sustainableHours) * 2) / 2) : 0;
  const nowDate = new Date(now);
  const attemptYear = (p.attempt_year as number | null) ?? null;
  const intelligence = assembleIntelligence({
    phase: getPhase(nowDate, attemptYear, (p.current_stage as any) ?? null, p.is_repeater === true),
    loggedDays: winReports.length,
    activeDays21: hrs.filter((h: number) => h > 0).length,
    recentActive10, priorActive10,
    capacityTrust: capacity.trust,
    capacityGapHours,
    completionRatio: adaptation.completionRatio,
    tooMuchRatio: adaptation.tooMuchRatio,
    momentumScore: momentum.score,
    coverage,
    maxDaysSincePracticed: recencyVals.length ? Math.max(...recencyVals) : null,
    daysSincePendingMock,
    mocksTaken: winReports.filter((r: any) => r.mock_taken === true).length,
    weakestBaseline: baselines.length ? Math.min(...baselines) : null,
    blocker: (p.biggest_blocker as Blocker | null) ?? null,
    targetPercentile: (p.target_percentile as number | null) ?? null,
    weeksToExam: weeksToExam(nowDate, attemptYear),
    gapDays: momentum.signals.daysSinceLastLog,
  });

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
    capacity,
    adaptation,
    intelligence,
    timeline: events.slice(0, 60),
  };
}
