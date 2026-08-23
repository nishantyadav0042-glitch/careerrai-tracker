import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import { AdminBuddiesList, type BuddyDossierData } from '../../admin-buddies-list';
import { computeSummary } from '@/lib/analytics';
import { computeBuddySLA } from '@/lib/buddy-sla';
import { MENTOR_OVERLOAD_THRESHOLD } from '@/lib/os/scale-config';
import { Card } from '@/components/ui/card';
import { BarChart2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DailyReport } from '@/types';
import { trailingWindow } from '@/lib/facts/window';
import { getLogDateString } from '@/lib/streak-utils';

export const dynamic = 'force-dynamic';

// THE MENTOR ROSTER — every mentor, whole profile, one page.
//
// Founder, 11 Aug: "There is no option in admin panel where I can see all the
// buddies and their profiles." He was right in the way that matters: the
// dossiers existed, but as a tab INSIDE /admin/students — a students page is
// the last place anyone looks for mentors, and Mentor Operations deliberately
// hides every healthy mentor. So the roster lives here now, in the Buddies
// workspace, as its own tab; the buried copy on /admin/students is gone. One
// responsibility, one home (the admin-workspaces rule).
//
// Operations answers "who needs me today"; this answers "who do I have" —
// their CAT journey, IIM, company, how they work, who they carry. Every card
// drills into the buddy 360 (Scale Contract: a roster you cannot drill out of
// is a dashboard, not an operator surface).
export default async function BuddyRosterPage() {
  const { admin } = await requireAdmin();

  // 0C.3 Wave 1. Was `now − 7d`, i.e. an EIGHT-day inclusive window feeding a
  // `daysSubmitted` that is rendered as "N/7". The window now comes from the
  // authority; the day key comes from the 05:30-IST study day rather than an
  // IST calendar date, which disagreed with it between 00:00 and 05:30.
  //
  // The BATCH READ itself is deliberately untouched — an unchecked
  // `.in(student_id, …)` over the whole cohort is the weekly-plan-reconcile
  // shape, and that migration is B3b, gated on cron telemetry.
  const weekAgoStr = trailingWindow(getLogDateString()).start;
   
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();

  const [{ data: buddyRows }, { data: assignedRows }, { data: recentFeedback }] = await Promise.all([
    // The full storefront dossier — same columns the buddy fills in setup.
    admin.from('profiles')
      .select('id, full_name, email, phone, cat_percentile, first_attempt_percentile, cat_year, iim_converted, current_company, strongest_section, student_types_helped, how_i_work, biggest_mistake, younger_self_advice, linkedin_url, avatar_url, buddy_meet_url, buddy_onboarding_completed, starting_percentile')
      .eq('role', 'buddy').not('is_test_account', 'is', true)
      .order('created_at', { ascending: true }),
    admin.from('profiles')
      .select('id, full_name, buddy_id, cat_percentile, starting_percentile')
      .eq('role', 'student').not('buddy_id', 'is', null)
      .not('is_test_account', 'is', true).not('is_demo', 'is', true),
    admin.from('buddy_feedback').select('buddy_id, created_at, feedback_date').gte('created_at', twoWeeksAgo),
  ]);

  const buddies = buddyRows ?? [];
  const assigned = assignedRows ?? [];
  const assignedIds = assigned.map((s) => s.id);

  const [{ data: reportRows }, { data: videoSessions }] = await Promise.all([
    assignedIds.length > 0
      ? admin.from('daily_reports')
          .select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy')
          .in('student_id', assignedIds).gte('report_date', weekAgoStr)
      : Promise.resolve({ data: [] as DailyReport[] }),
    buddies.length > 0
      ? admin.from('video_sessions').select('buddy_id, session_status').in('buddy_id', buddies.map((b) => b.id))
      : Promise.resolve({ data: [] }),
  ]);

  const reportsByStudent = new Map<string, DailyReport[]>();
  for (const r of (reportRows ?? []) as DailyReport[]) {
    if (!reportsByStudent.has(r.student_id)) reportsByStudent.set(r.student_id, []);
    reportsByStudent.get(r.student_id)!.push(r);
  }
  const studentsByBuddy = new Map<string, { id: string; full_name: string }[]>();
  for (const s of assigned) {
    const list = studentsByBuddy.get(s.buddy_id as string) ?? [];
    list.push({ id: s.id as string, full_name: (s.full_name as string) ?? 'Student' });
    studentsByBuddy.set(s.buddy_id as string, list);
  }

  const rows = buddies.map((b) => {
    const myStudents = studentsByBuddy.get(b.id as string) ?? [];
    const redFlags = myStudents.filter(
      (s) => computeSummary(reportsByStudent.get(s.id) ?? [], 7).redFlags.length > 0
    ).length;
    const myFeedback = (recentFeedback ?? []).filter((f) => f.buddy_id === b.id);
    const gaps = myFeedback
      .map((f) => (new Date(f.created_at as string).getTime() - new Date((f.feedback_date as string) + 'T00:00:00').getTime()) / 3600000)
      .filter((h) => h >= 0 && h < 24 * 7);
    const avgResponseHrs = gaps.length > 0 ? Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length)) : null;
    return {
      buddy: b as unknown as BuddyDossierData,
      studentCount: myStudents.length,
      redFlags,
      feedbackCount: myFeedback.length,
      avgResponseHrs,
      students: myStudents,
    };
  }).sort((a, z) => z.studentCount - a.studentCount || (a.buddy.full_name ?? '').localeCompare(z.buddy.full_name ?? ''));

  const sla = computeBuddySLA(
    buddies.map((b) => ({ id: b.id as string, full_name: (b.full_name as string) ?? 'Mentor' })),
    assigned.map((s) => ({
      id: s.id as string,
      buddy_id: (s.buddy_id as string) ?? null,
      cat_percentile: (s.cat_percentile as number) ?? null,
      starting_percentile: (s.starting_percentile as number) ?? null,
    })),
    recentFeedback ?? [],
    (videoSessions ?? []) as Array<{ buddy_id: string | null; session_status: string }>,
  );

  // Slots only count for mentors who can actually take a student: room set and
  // onboarding done. A "free slot" on a mentor who cannot run a session is the
  // Aarav Mehta bug wearing a roster.
  const openSlots = buddies.reduce((sum, b) => {
    const ready = !!b.buddy_meet_url && b.buddy_onboarding_completed === true;
    return ready ? sum + Math.max(0, MENTOR_OVERLOAD_THRESHOLD - (studentsByBuddy.get(b.id as string)?.length ?? 0)) : sum;
  }, 0);

  return (
    <WorkspaceShell
      workspaceId="buddies"
      activeHref="/admin/buddies/roster"
      title="All mentors"
      subtitle={`${buddies.length} mentor${buddies.length === 1 ? '' : 's'} · ${assigned.length} student${assigned.length === 1 ? '' : 's'} assigned · ${openSlots} open slot${openSlots === 1 ? '' : 's'} on session-ready mentors`}
    >
      {rows.length === 0 ? (
        <AdminEmpty>No mentors yet. When a buddy signs up, their whole profile appears here.</AdminEmpty>
      ) : (
        <AdminBuddiesList rows={rows} />
      )}

      {sla.length > 0 && (
        <div className="mt-6">
          <div className="mb-3 flex items-center gap-2 px-1">
            <BarChart2 className="h-4 w-4 text-stone-500" />
            <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">Buddy SLA — ranked by avg %ile delta</h2>
          </div>
          <div className="space-y-2">
            {sla.map((row, rank) => (
              <Card key={row.buddy_id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600">#{rank + 1}</div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold text-stone-900">{row.buddy_name}</div>
                    <div className="mt-0.5 text-xs text-stone-500">{row.student_count} student{row.student_count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="flex flex-shrink-0 gap-3 text-right">
                    <div>
                      <div className={cn('text-lg font-bold', row.avg_percentile_delta === null ? 'text-stone-400' : row.avg_percentile_delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {row.avg_percentile_delta !== null ? `${row.avg_percentile_delta > 0 ? '+' : ''}${row.avg_percentile_delta}` : '—'}
                      </div>
                      <div className="text-[10px] text-stone-500">%ile Δ</div>
                    </div>
                    <div>
                      <div className={cn('text-lg font-bold', row.avg_response_hrs === null ? 'text-stone-400' : row.avg_response_hrs <= 24 ? 'text-emerald-600' : row.avg_response_hrs <= 48 ? 'text-amber-600' : 'text-red-600')}>
                        {row.avg_response_hrs !== null ? `${row.avg_response_hrs}h` : '—'}
                      </div>
                      <div className="text-[10px] text-stone-500">resp.</div>
                    </div>
                    <div>
                      <div className={cn('text-lg font-bold', row.session_show_up_rate === null ? 'text-stone-400' : row.session_show_up_rate >= 80 ? 'text-emerald-600' : row.session_show_up_rate >= 60 ? 'text-amber-600' : 'text-red-600')}>
                        {row.session_show_up_rate !== null ? `${row.session_show_up_rate}%` : '—'}
                      </div>
                      <div className="text-[10px] text-stone-500">show-up</div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </WorkspaceShell>
  );
}
