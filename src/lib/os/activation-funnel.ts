/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── The Founder Funnel — where the 212 disappear ────────────────────────────
//
// Founder + co-founder review, 10 Aug: "Before changing the product, establish
// signup → onboarding → Blueprint → first task → first log → day-2 → day-7,
// segmented. 43/255 ever activating is the number I want to understand before
// touching ten things at once. Not another dashboard with 30 numbers — ONE
// funnel, and every number clickable into the exact students."
//
// So this is one ordered funnel over real stored facts — no invented stages.
// Every stage carries its member ids, and the page renders each LEAK (reached
// the previous stage, never reached this one) as a drill-down list of the exact
// students, per the drill-down law in docs/SCALE-CONTRACT.md. Segmentable by
// plan source (self-prep vs coaching), because the two onboarding paths differ.
//
// Stage sources (each provable, none inferred):
//   signed_up        profiles (real students)
//   onboarded        profiles.onboarding_completed = true
//   plan_built       has a daily_routines row (the Blueprint generated)
//   opened_again     an app_open event on a LATER IST day than signup
//   first_tick       has a routine_task_completions row (touched the plan)
//   first_log        has a daily_reports row
//   day2_return      app_open or log on signup day +1 or later… within 2 days
//   week1_retained   any activity (open or log) 7+ days after signup

export interface FunnelStudent {
  id: string;
  name: string;
  phone: string | null;
  createdAt: string;               // ISO
  planSource: 'coaching' | 'self' ;
  onboarded: boolean;
  planBuilt: boolean;
  tickedTask: boolean;
  logged: boolean;
  /** Distinct IST day-strings on which the student showed activity (opens+logs). */
  activityDays: string[];
}

export type StageKey =
  | 'signed_up' | 'onboarded' | 'plan_built' | 'opened_again'
  | 'first_tick' | 'first_log' | 'day2_return' | 'week1_retained';

export interface FunnelStage {
  key: StageKey;
  label: string;
  /** The exact students at this stage — the number IS this list's length. */
  members: FunnelStudent[];
  /** Students who reached the previous stage but never this one — the leak. */
  leak: FunnelStudent[];
}

const IST_OFFSET_MS = 5.5 * 3_600_000;
export function istDay(iso: string): string {
  return new Date(Date.parse(iso) + IST_OFFSET_MS).toISOString().slice(0, 10);
}
function daysAfter(signupDay: string, day: string): number {
  return Math.round((Date.parse(day) - Date.parse(signupDay)) / 86_400_000);
}

/** Pure stage predicates over one student — the funnel's whole definition. */
export function reachedStage(s: FunnelStudent, key: StageKey): boolean {
  const signupDay = istDay(s.createdAt);
  const offsets = s.activityDays.map((d) => daysAfter(signupDay, d));
  switch (key) {
    case 'signed_up':      return true;
    case 'onboarded':      return s.onboarded;
    case 'plan_built':     return s.planBuilt;
    case 'opened_again':   return offsets.some((n) => n >= 1);
    case 'first_tick':     return s.tickedTask;
    case 'first_log':      return s.logged;
    case 'day2_return':    return offsets.some((n) => n >= 1 && n <= 2);
    case 'week1_retained': return offsets.some((n) => n >= 7);
  }
}

export const STAGES: { key: StageKey; label: string }[] = [
  { key: 'signed_up',      label: 'Signed up' },
  { key: 'onboarded',      label: 'Completed onboarding' },
  { key: 'plan_built',     label: 'Blueprint generated' },
  { key: 'first_tick',     label: 'Ticked a first task' },
  { key: 'first_log',      label: 'Logged a first day' },
  { key: 'day2_return',    label: 'Came back (day 1–2)' },
  { key: 'week1_retained', label: 'Still active in week 2' },
];

/**
 * Compute the ordered funnel. Stages are CUMULATIVE — a stage's members must
 * have reached every earlier stage too, so the numbers can only fall and every
 * leak is attributable to exactly one step.
 */
export function computeFunnel(students: FunnelStudent[]): FunnelStage[] {
  const out: FunnelStage[] = [];
  let pool = students;
  for (const { key, label } of STAGES) {
    const members = pool.filter((s) => reachedStage(s, key));
    const leak = pool.filter((s) => !reachedStage(s, key));
    out.push({ key, label, members, leak });
    pool = members;
  }
  return out;
}

export interface ActivationFunnel {
  stages: FunnelStage[];
  /** Signup-week cohorts (IST Monday), newest first, with per-stage counts. */
  cohorts: { week: string; total: number; onboarded: number; ticked: number; logged: number; returned: number }[];
}

export async function assembleActivationFunnel(
  admin: Admin,
  segment: 'all' | 'self' | 'coaching',
): Promise<ActivationFunnel> {
  const [{ data: profs }, { data: routines }, { data: ticks }, { data: logs }, { data: opens }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, created_at, plan_source, onboarding_completed')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true),
    admin.from('daily_routines').select('student_id').limit(50000),
    admin.from('routine_task_completions').select('student_id').limit(50000),
    admin.from('daily_reports').select('student_id, report_date').limit(50000),
    admin.from('student_events').select('user_id, created_at').eq('event', 'app_open').limit(100000),
  ]);

  const planBuilt = new Set((routines ?? []).map((r: any) => r.student_id));
  const ticked = new Set((ticks ?? []).map((r: any) => r.student_id));
  const loggedBy = new Map<string, Set<string>>();
  for (const r of logs ?? []) {
    if (!loggedBy.has(r.student_id)) loggedBy.set(r.student_id, new Set());
    loggedBy.get(r.student_id)!.add(r.report_date as string);
  }
  const openDays = new Map<string, Set<string>>();
  for (const e of opens ?? []) {
    const id = e.user_id as string | null;
    if (!id) continue;
    if (!openDays.has(id)) openDays.set(id, new Set());
    openDays.get(id)!.add(istDay(e.created_at as string));
  }

  let students: FunnelStudent[] = (profs ?? []).map((p: any) => {
    const days = new Set<string>([...(openDays.get(p.id) ?? []), ...(loggedBy.get(p.id) ?? [])]);
    return {
      id: p.id,
      name: (p.full_name as string | null) ?? 'Student',
      phone: (p.phone as string | null) ?? null,
      createdAt: p.created_at as string,
      planSource: p.plan_source === 'coaching' ? 'coaching' as const : 'self' as const,
      onboarded: p.onboarding_completed === true,
      planBuilt: planBuilt.has(p.id),
      tickedTask: ticked.has(p.id),
      logged: (loggedBy.get(p.id)?.size ?? 0) > 0,
      activityDays: [...days],
    };
  });
  if (segment !== 'all') students = students.filter((s) => s.planSource === segment);

  // Signup-week cohorts (IST Monday key), newest first.
  const byWeek = new Map<string, FunnelStudent[]>();
  for (const s of students) {
    const d = new Date(Date.parse(istDay(s.createdAt) + 'T00:00:00Z'));
    const monday = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
    const key = monday.toISOString().slice(0, 10);
    if (!byWeek.has(key)) byWeek.set(key, []);
    byWeek.get(key)!.push(s);
  }
  const cohorts = [...byWeek.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 8)
    .map(([week, list]) => ({
      week,
      total: list.length,
      onboarded: list.filter((s) => reachedStage(s, 'onboarded')).length,
      ticked: list.filter((s) => reachedStage(s, 'first_tick')).length,
      logged: list.filter((s) => reachedStage(s, 'first_log')).length,
      returned: list.filter((s) => reachedStage(s, 'day2_return')).length,
    }));

  return { stages: computeFunnel(students), cohorts };
}
