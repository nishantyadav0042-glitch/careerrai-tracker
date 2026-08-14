import { buildBuddyCase, topFindings, type CaseFinding } from '@/lib/buddy-case';
import { mockInformedFocus, type DebriefRow } from '@/lib/mock-informed-focus';
import { remainingSyllabusHours } from '@/lib/study-pace';
import type { CoverageStatus } from '@/lib/coverage-status';

// ── The student's case, assembled from their real rows ──────────────────────
//
// Server-side loader for the Buddy conversion screen. Every number the screen
// shows a student about themselves comes through here, from the same tables
// the planner reads — never estimated, never softened. buildBuddyCase then
// decides what may be SAID (its tests are mostly about staying silent when
// the evidence is thin).

export interface StudentCase {
  findings: CaseFinding[];
  topKind: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadStudentCase(admin: any, studentId: string): Promise<StudentCase> {
  const since = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const [
    { data: profile },
    { data: routines },
    { data: reports },
    { data: debriefs },
    { data: coverage },
  ] = await Promise.all([
    admin.from('profiles')
      .select('is_repeater, buddy_id, syllabus_target_date, study_target_hours, hours_available, self_reported_weakest_section')
      .eq('id', studentId).maybeSingle(),
    admin.from('daily_routines').select('est_minutes').eq('student_id', studentId).gte('routine_date', since),
    admin.from('daily_reports').select('study_duration').eq('student_id', studentId).gte('report_date', since),
    admin.from('mock_debriefs').select('taken_on, varc, dilr, qa, overall_percentile')
      .eq('student_id', studentId).order('taken_on', { ascending: true }).limit(8),
    admin.from('topic_coverage').select('topic, status').eq('student_id', studentId),
  ]);

  const plannedHours7d = (routines ?? []).reduce((s: number, r: { est_minutes: unknown }) => s + (Number(r.est_minutes) || 0), 0) / 60;
  const loggedHours7d = (reports ?? []).reduce((s: number, r: { study_duration: unknown }) => s + (Number(r.study_duration) || 0), 0);

  const mockRows = (debriefs ?? []) as (DebriefRow & { overall_percentile: unknown })[];
  const percentiles = mockRows
    .map((d) => Number(d.overall_percentile))
    .filter((p) => Number.isFinite(p));

  // "Weakest NOW" only from measured mocks — passing the signup answer as
  // "now" would make the repeater finding fire on zero evidence.
  const newestFirst = [...mockRows].reverse();
  const focus = mockInformedFocus(newestFirst, today);

  // Coverage % by curriculum hours — the same basis as the Home ring, and the
  // effort multiplier cancels in the ratio so effort=1 is exact.
  const rows = ((coverage ?? []) as { topic: string; status: CoverageStatus }[]);
  const totalHours = remainingSyllabusHours([], 1);
  const remaining = remainingSyllabusHours(rows, 1);
  const coveragePct = totalHours > 0 ? Math.round(100 * (1 - remaining / totalHours)) : null;

  const target = profile?.syllabus_target_date as string | null;
  const daysToTarget = target
    ? Math.round((Date.parse(target) - Date.parse(today)) / 86_400_000)
    : null;

  const findings = buildBuddyCase({
    plannedHours7d: plannedHours7d > 0 ? Math.round(plannedHours7d) : null,
    loggedHours7d: plannedHours7d > 0 ? Math.round(loggedHours7d * 10) / 10 : null,
    missedDays7d: null,
    recentMockPercentiles: percentiles,
    coveragePct,
    daysToTarget,
    hasPlanShape: !!target && (profile?.study_target_hours != null || profile?.hours_available != null),
    isRepeater: !!profile?.is_repeater,
    weakestSectionNow: focus?.weakest ?? null,
    weakestSectionAtSignup: (profile?.self_reported_weakest_section as string | null) ?? null,
    hasMentor: !!profile?.buddy_id,
  });

  const top = topFindings(findings);
  return { findings: top, topKind: top[0]?.kind ?? null };
}
