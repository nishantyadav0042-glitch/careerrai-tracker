import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { AdminMatchPanel } from '../admin-match-panel';
import { AdminStudentsList } from '../admin-students-list';
import { AdminBuddiesList, type BuddyDossierData } from '../admin-buddies-list';
import { AdminTabs, type AdminTab } from '../admin-tabs';
import type { Profile, DailyReport } from '@/types';
import { BarChart2 } from 'lucide-react';
import { computeBuddySLA } from '@/lib/buddy-sla';
import { cn } from '@/lib/utils';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// STUDENTS & BUDDIES — moved out of the old single-scroll /admin page
// (reorg, 14 July). Dossiers, matching, and buddy SLA live here; the Today
// page stays an action center.
export default async function AdminStudentsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') redirect('/login');

  // Full onboarding columns — the students list renders complete dossiers.
  const { data: allProfiles } = await admin.from('profiles').select('id, role, full_name, email, phone, exam_target, buddy_id, cat_percentile, starting_percentile, onboarding_completed, college, category, is_repeater, is_working_professional, work_ex_months, coaching_enrolled, created_at, course_year, attempt_year, target_percentile, hours_available, study_target_hours, baseline_varc, baseline_dilr, baseline_qa, baseline_mocks_taken, dream_colleges, signup_source, strongest_section, student_types_helped, iim_converted, first_attempt_percentile, cat_year, current_company, biggest_mistake, younger_self_advice, how_i_work, linkedin_url, avatar_url, app_installed, notif_prefs').order('created_at', { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profiles = (allProfiles ?? []) as any as Profile[];

  const { data: allowlistRows } = await admin
    .from('student_allowlist')
    .select('id, phone, email, full_name, status, assigned_buddy_id, person_type')
    .order('created_at', { ascending: false });

  const students = profiles.filter(p => p.role === 'student');
  const buddies = profiles.filter(p => p.role === 'buddy');

  const profilePhones = new Set(profiles.map(p => p.phone).filter(Boolean));
  const pendingStudents = (allowlistRows ?? []).filter(r =>
    (r.person_type === 'student' || !r.person_type) &&
    r.phone &&
    !profilePhones.has(r.phone) &&
    r.status !== 'paused'
  );

  const today = getTodayIST();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const studentIds = students.map(s => s.id);
  const buddyIds = buddies.map(b => b.id);
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const [
    { data: reportsData },
    { data: recentFeedback },
    { data: videoSessions },
  ] = await Promise.all([
    studentIds.length > 0
      ? admin.from('daily_reports').select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy').in('student_id', studentIds).gte('report_date', weekAgoStr)
      : Promise.resolve({ data: [] as DailyReport[] }),
    admin.from('buddy_feedback').select('buddy_id, created_at, feedback_date').gte('created_at', twoWeeksAgo),
    buddyIds.length > 0
      ? admin.from('video_sessions').select('buddy_id, session_status').in('buddy_id', buddyIds)
      : Promise.resolve({ data: [] }),
  ]);
  const reports: DailyReport[] = (reportsData ?? []) as DailyReport[];

  const buddyById = new Map(buddies.map(b => [b.id, b]));
  const studentsByBuddyId = new Map<string, Profile[]>();
  for (const s of students) {
    if (s.buddy_id) {
      if (!studentsByBuddyId.has(s.buddy_id)) studentsByBuddyId.set(s.buddy_id, []);
      studentsByBuddyId.get(s.buddy_id)!.push(s);
    }
  }
  const reportsByStudentId = new Map<string, DailyReport[]>();
  for (const r of reports) {
    if (!reportsByStudentId.has(r.student_id)) reportsByStudentId.set(r.student_id, []);
    reportsByStudentId.get(r.student_id)!.push(r);
  }

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const studentStats = students.map((s) => {
    const reps = reportsByStudentId.get(s.id) ?? [];
    const lastReport = [...reps].sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
    const summary = computeSummary(reps, 7);
    const buddy = buddyById.get(s.buddy_id ?? '');
    const submittedToday = reps.some(r => r.report_date === today);
    const createdAt = (s as Profile & { created_at?: string }).created_at;
    const joinedMs = createdAt ? new Date(createdAt).getTime() : 0;
    const daysSinceJoin = joinedMs ? Math.floor((nowMs - joinedMs) / 86400000) : null;
    const joinedLabel = createdAt
      ? new Date(createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
      : null;
    return {
      student: s,
      summary,
      lastDate: lastReport?.report_date,
      buddy,
      submittedToday,
      hasRedFlags: summary.redFlags.length > 0,
      joinedLabel,
      daysSinceJoin,
      isNew: daysSinceJoin !== null && daysSinceJoin <= 7,
    };
  });
  const studentStatsById = new Map(studentStats.map(ss => [ss.student.id, ss]));

  const buddyStats = buddies.map(b => {
    const myStudents = studentsByBuddyId.get(b.id) ?? [];
    const myStats = myStudents.map(s => studentStatsById.get(s.id)!).filter(Boolean);
    const redFlags = myStats.filter(s => s.hasRedFlags).length;
    const myFeedback = (recentFeedback ?? []).filter(f => f.buddy_id === b.id);
    const gaps = myFeedback
      .map(f => (new Date(f.created_at).getTime() - new Date(f.feedback_date + 'T00:00:00').getTime()) / 3600000)
      .filter(h => h >= 0 && h < 24 * 7);
    const avgResponseHrs = gaps.length > 0 ? Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length)) : null;
    return { buddy: b, studentCount: myStudents.length, redFlags, students: myStudents, feedbackCount: myFeedback.length, avgResponseHrs };
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rawProfiles = allProfiles as any as Array<{ id: string; role: string; buddy_id: string | null; cat_percentile: number | null; starting_percentile: number | null }>;
  const buddySLARanking = computeBuddySLA(
    buddies.map(b => ({ id: b.id, full_name: b.full_name })),
    rawProfiles
      .filter(p => p.role === 'student')
      .map(p => ({ id: p.id, buddy_id: p.buddy_id ?? null, cat_percentile: p.cat_percentile ?? null, starting_percentile: p.starting_percentile ?? null })),
    (recentFeedback ?? []),
    (videoSessions ?? []) as Array<{ buddy_id: string | null; session_status: string }>
  );

  const unmatchedStudents = students.filter(s => !s.buddy_id);
  const buddyMatchData = buddies.map(b => ({
    id: b.id,
    full_name: b.full_name,
    cat_percentile: (b as Profile & { cat_percentile?: number | null }).cat_percentile ?? null,
    starting_percentile: (b as Profile & { starting_percentile?: number | null }).starting_percentile ?? null,
    is_repeater: (b as Profile & { is_repeater?: boolean | null }).is_repeater ?? null,
    is_working_professional: (b as Profile & { is_working_professional?: boolean | null }).is_working_professional ?? null,
    studentCount: (studentsByBuddyId.get(b.id) ?? []).length,
  }));

  const studentsSection = (
    <div className="space-y-6">
      {unmatchedStudents.length > 0 && buddies.length > 0 && (
        <AdminMatchPanel unmatchedStudents={unmatchedStudents} buddies={buddyMatchData} />
      )}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">All students</h2>
        <AdminStudentsList students={studentStats} buddies={buddies} pendingStudents={pendingStudents} />
      </div>
    </div>
  );

  const buddiesSection = (
    <div className="space-y-6">
      <AdminBuddiesList
        rows={buddyStats.map(({ buddy, studentCount, redFlags, feedbackCount, avgResponseHrs, students: myStudents }) => ({
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          buddy: buddy as any as BuddyDossierData,
          studentCount,
          redFlags,
          feedbackCount,
          avgResponseHrs,
          students: myStudents.map((s) => ({ id: s.id, full_name: s.full_name })),
        }))}
      />
      {buddySLARanking.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-3 px-1">
            <BarChart2 className="w-4 h-4 text-stone-500" />
            <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Buddy SLA — ranked by avg %ile delta</h2>
          </div>
          <div className="space-y-2">
            {buddySLARanking.map((sla, rank) => (
              <Card key={sla.buddy_id} className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600 flex-shrink-0">#{rank + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-stone-900 text-sm">{sla.buddy_name}</div>
                    <div className="text-xs text-stone-500 mt-0.5">{sla.student_count} student{sla.student_count !== 1 ? 's' : ''}</div>
                  </div>
                  <div className="flex gap-3 text-right flex-shrink-0">
                    <div>
                      <div className={cn('text-lg font-bold', sla.avg_percentile_delta === null ? 'text-stone-400' : sla.avg_percentile_delta >= 0 ? 'text-emerald-600' : 'text-red-600')}>
                        {sla.avg_percentile_delta !== null ? `${sla.avg_percentile_delta > 0 ? '+' : ''}${sla.avg_percentile_delta}` : '—'}
                      </div>
                      <div className="text-[10px] text-stone-500">%ile Δ</div>
                    </div>
                    <div>
                      <div className={cn('text-lg font-bold', sla.avg_response_hrs === null ? 'text-stone-400' : sla.avg_response_hrs <= 24 ? 'text-emerald-600' : sla.avg_response_hrs <= 48 ? 'text-amber-600' : 'text-red-600')}>
                        {sla.avg_response_hrs !== null ? `${sla.avg_response_hrs}h` : '—'}
                      </div>
                      <div className="text-[10px] text-stone-500">resp.</div>
                    </div>
                    <div>
                      <div className={cn('text-lg font-bold', sla.session_show_up_rate === null ? 'text-stone-400' : sla.session_show_up_rate >= 80 ? 'text-emerald-600' : sla.session_show_up_rate >= 60 ? 'text-amber-600' : 'text-red-600')}>
                        {sla.session_show_up_rate !== null ? `${sla.session_show_up_rate}%` : '—'}
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
    </div>
  );

  const adminTabs: AdminTab[] = [
    { id: 'students', label: 'Students', badge: students.length + pendingStudents.length, content: studentsSection },
    { id: 'buddies', label: 'Buddies', badge: buddies.length, content: buddiesSection },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Students &amp; Buddies</h1>
        <p className="mt-0.5 text-xs text-stone-500">Dossiers, matching, and buddy performance.</p>
      </div>
      <AdminTabs tabs={adminTabs} />
    </div>
  );
}
