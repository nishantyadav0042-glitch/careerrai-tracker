import { buildBuddyCase, topFindings, statusBullets, type BuddyCaseInput, type CaseFinding } from '@/lib/buddy-case';
import { mockInformedFocus, type DebriefRow } from '@/lib/mock-informed-focus';
import { remainingSyllabusHours } from '@/lib/study-pace';
import { QUANT_TOPICS, VERBAL_TOPICS, LRDI_TOPICS } from '@/lib/topics-constants';
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
  /** Exactly three pointers for the conversion screen: real gaps first
   *  (gap: true, shown red), padded with neutral personal status facts. The
   *  generic "nobody reviews your prep" floor never appears here — every
   *  bullet is this student's own number. */
  bullets: { chip: string; stat: string; gap: boolean }[];
  gapCount: number;
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
    { data: lastMockReport },
    { data: recentSwaps },
  ] = await Promise.all([
    admin.from('profiles')
      .select('is_repeater, buddy_id, syllabus_target_date, study_target_hours, hours_available, self_reported_weakest_section')
      .eq('id', studentId).maybeSingle(),
    admin.from('daily_routines').select('est_minutes').eq('student_id', studentId).gte('routine_date', since),
    admin.from('daily_reports').select('study_duration').eq('student_id', studentId).gte('report_date', since),
    admin.from('mock_debriefs').select('taken_on, varc, dilr, qa, overall_percentile')
      .eq('student_id', studentId).order('taken_on', { ascending: true }).limit(8),
    admin.from('topic_coverage').select('topic, status').eq('student_id', studentId),
    admin.from('daily_reports').select('report_date').eq('student_id', studentId)
      .eq('mock_taken', true).order('report_date', { ascending: false }).limit(1).maybeSingle(),
    admin.from('daily_routines').select('swapped_out').eq('student_id', studentId)
      .gte('routine_date', new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10)),
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

  // "9 of 28 QA topics started" — per-section progress from the canonical
  // syllabus lists, so the totals can never drift from the planner's.
  const startedSet = new Set(rows.filter((r) => r.status !== 'not_started').map((r) => r.topic));
  const sectionsStarted = [
    { section: 'QA', list: QUANT_TOPICS }, { section: 'VARC', list: VERBAL_TOPICS }, { section: 'DILR', list: LRDI_TOPICS },
  ].map(({ section, list }) => ({
    section,
    started: list.filter((t) => startedSet.has(t)).length,
    total: list.length,
  }));

  const lastMockIso = (lastMockReport?.report_date as string | null) ?? mockRows[mockRows.length - 1]?.taken_on ?? null;
  const mocksEver = !!lastMockIso;
  const daysSinceLastMock = lastMockIso
    ? Math.max(0, Math.round((Date.parse(today) - Date.parse(lastMockIso)) / 86_400_000))
    : null;

  // The topic they keep pushing away — their own swaps, counted.
  const swapCounts = new Map<string, number>();
  for (const r of (recentSwaps ?? []) as { swapped_out: unknown }[]) {
    for (const t of (Array.isArray(r.swapped_out) ? r.swapped_out : []) as string[]) {
      if (typeof t === 'string') swapCounts.set(t, (swapCounts.get(t) ?? 0) + 1);
    }
  }
  const topSwap = [...swapCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const repeatSwapped = topSwap && topSwap[1] >= 2 ? { topic: topSwap[0], times: topSwap[1] } : null;

  const caseInput: BuddyCaseInput = {
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
    sectionsStarted,
    mocksEver,
    daysSinceLastMock,
    repeatSwapped,
  };
  const findings = buildBuddyCase(caseInput);

  const top = topFindings(findings);
  const gaps = top.filter((f) => f.kind !== 'unreviewed');
  const bullets: { chip: string; stat: string; gap: boolean }[] =
    gaps.map((f) => ({ chip: f.chip, stat: f.stat, gap: true }));
  for (const b of statusBullets(caseInput)) {
    if (bullets.length >= 3) break;
    if (bullets.some((x) => x.chip === b.chip)) continue;
    bullets.push({ ...b, gap: false });
  }

  return {
    findings: top,
    topKind: gaps[0]?.kind ?? top[0]?.kind ?? null,
    bullets: bullets.slice(0, 3),
    gapCount: gaps.length,
  };
}
