import type { createAdminClient } from '@/lib/supabase/admin';

// Student DNA — the per-student behavioural fingerprint. Deterministic and
// EXPLAINABLE by design (right for this stage; predictive ML is premature at a
// few hundred students and would overfit). Every score is a transparent rule
// over data we already have — daily_reports, streak_data, student_events,
// profile — and the raw `signals` are stored so any score can be justified and
// so an ML model can later replace a rule without changing consumers.
//
// Scores are 0-100. Higher = more of that thing (incl. churn_risk = more likely
// gone). purchase_intent is null once a student is premium.

type Admin = ReturnType<typeof createAdminClient>;
const DAY = 86_400_000;

export interface DnaProfileInput {
  id: string;
  created_at: string | null;
  onboarding_completed: boolean | null;
  app_installed: boolean | null;
  notif_prefs: Record<string, unknown> | null;
  is_premium: boolean | null;
  last_seen_at: string | null;
}

export interface StudentDna {
  activation: number;
  consistency: number;
  momentum: number;
  purchase_intent: number | null;
  churn_risk: number;
  journey_stage: 'signed_up' | 'activated' | 'habitual' | 'premium' | 'dormant';
  signals: Record<string, unknown>;
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const dateNDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().split('T')[0];
const isoNDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

export async function computeStudentDna(admin: Admin, p: DnaProfileInput): Promise<StudentDna> {
  const now = Date.now();

  const [{ data: logs }, { data: streak }, { data: events }] = await Promise.all([
    admin.from('daily_reports').select('report_date, study_duration').eq('student_id', p.id).gte('report_date', dateNDaysAgo(30)),
    admin.from('streak_data').select('current_streak, last_log_date').eq('student_id', p.id).maybeSingle(),
    admin.from('student_events').select('event, created_at, path').eq('user_id', p.id).gte('created_at', isoNDaysAgo(30)),
  ]);

  // ── logging cadence ──
  const logDates = new Set((logs ?? []).map((l) => l.report_date as string));
  const daysBack = (d: string) => Math.floor((now - Date.parse(d + 'T00:00:00')) / DAY);
  const inWindow = (start: number, end: number) => [...logDates].filter((d) => { const b = daysBack(d); return b >= start && b < end; }).length;
  const logDays30 = logDates.size;
  const logDays7 = inWindow(0, 7);
  const logDaysPrev7 = inWindow(7, 14);
  const lastLog = [...logDates].sort().reverse()[0] ?? null;
  const currentStreak = (streak?.current_streak as number | undefined) ?? 0;

  // ── event signals ──
  const ev = events ?? [];
  const evCount = (name: string) => ev.filter((e) => e.event === name).length;
  const buddyPlanClicks = evCount('buddy_plan_click');
  const buddyUnlockOpens = evCount('buddy_unlock_open');
  const buddyCtaClicks = evCount('buddy_cta_click');
  const paywallViews = ev.filter((e) => (e.event === 'screen_view' || e.event === 'pageview') && typeof e.path === 'string' && (e.path as string).startsWith('/student/buddy')).length;

  // ── recency (real "last activity" across every signal) ──
  const lastEventAt = ev.reduce((m, e) => Math.max(m, Date.parse(e.created_at as string)), 0);
  const lastSeen = p.last_seen_at ? Date.parse(p.last_seen_at) : 0;
  const lastLogMs = lastLog ? Date.parse(lastLog + 'T00:00:00') : 0;
  const lastActivity = Math.max(lastEventAt, lastSeen, lastLogMs);
  const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / DAY) : 999;
  const ageDays = p.created_at ? Math.floor((now - Date.parse(p.created_at)) / DAY) : 0;

  // ── scores ──
  let activation = 0;
  if (p.onboarding_completed) activation += 25;
  if (p.app_installed) activation += 25;
  if ((p.notif_prefs as { push?: boolean } | null)?.push === true) activation += 25;
  if (logDays30 > 0) activation += 25;

  const consistency = clamp((logDays30 / 30) * 100);
  const momentum = clamp(50 + (logDays7 - logDaysPrev7) * 10);

  let purchase_intent: number | null;
  if (p.is_premium) {
    purchase_intent = null; // already converted — intent is moot
  } else {
    purchase_intent = clamp(buddyPlanClicks * 40 + buddyUnlockOpens * 20 + buddyCtaClicks * 15 + paywallViews * 5);
  }

  let churn_risk =
    daysSinceActivity <= 1 ? 5 :
    daysSinceActivity <= 3 ? 25 :
    daysSinceActivity <= 6 ? 50 :
    daysSinceActivity <= 13 ? 75 : 95;
  if (logDaysPrev7 > 0 && logDays7 < logDaysPrev7) churn_risk = clamp(churn_risk + 10);      // logging is declining
  if (logDays30 === 0 && ageDays > 3) churn_risk = Math.max(churn_risk, 80);                  // signed up, never studied

  const habitual = logDays30 >= 12;
  const activated = activation >= 75;
  const journey_stage: StudentDna['journey_stage'] =
    daysSinceActivity >= 14 ? 'dormant' :
    p.is_premium ? 'premium' :
    habitual ? 'habitual' :
    activated ? 'activated' : 'signed_up';

  return {
    activation,
    consistency,
    momentum,
    purchase_intent,
    churn_risk,
    journey_stage,
    signals: {
      logDays30, logDays7, logDaysPrev7, currentStreak, lastLog,
      daysSinceActivity, ageDays,
      buddyPlanClicks, buddyUnlockOpens, buddyCtaClicks, paywallViews,
    },
  };
}
