import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { AdminMatchPanel } from '../admin-match-panel';
import { AdminStudentsList } from '../admin-students-list';
import type { Profile, DailyReport } from '@/types';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// STUDENT DOSSIERS & MATCHING — moved out of the old single-scroll /admin page
// (reorg, 14 July). The buddy dossiers and SLA that used to hide in a second
// tab here moved to /admin/buddies/roster on 11 Aug — the founder looked for
// "all the buddies" and could not find them inside a students page. One
// responsibility, one home.
export default async function AdminStudentsPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') redirect('/login');

  // Full onboarding columns — the students list renders complete dossiers.
  const { data: allProfiles } = await admin.from('profiles').select('id, role, full_name, email, phone, exam_target, buddy_id, cat_percentile, starting_percentile, onboarding_completed, college, category, is_repeater, is_working_professional, work_ex_months, coaching_enrolled, created_at, course_year, attempt_year, target_percentile, hours_available, study_target_hours, baseline_varc, baseline_dilr, baseline_qa, baseline_mocks_taken, dream_colleges, signup_source, strongest_section, student_types_helped, iim_converted, first_attempt_percentile, cat_year, current_company, biggest_mistake, younger_self_advice, how_i_work, linkedin_url, avatar_url, app_installed, notif_prefs, is_premium').order('created_at', { ascending: false });
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
  const { data: reportsData } = studentIds.length > 0
    ? await admin.from('daily_reports').select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy').in('student_id', studentIds).gte('report_date', weekAgoStr)
    : { data: [] as DailyReport[] };
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
  // Buddy assignment is a PAID feature (founder rule, 15 Jul): only upgraded
  // students are matchable — free students don't get a Buddy until they pay.
  const unmatchedStudents = students.filter(
    s => !s.buddy_id && (s as Profile & { is_premium?: boolean | null }).is_premium === true
  );
  const buddyMatchData = buddies.map(b => ({
    id: b.id,
    full_name: b.full_name,
    cat_percentile: (b as Profile & { cat_percentile?: number | null }).cat_percentile ?? null,
    starting_percentile: (b as Profile & { starting_percentile?: number | null }).starting_percentile ?? null,
    is_repeater: (b as Profile & { is_repeater?: boolean | null }).is_repeater ?? null,
    is_working_professional: (b as Profile & { is_working_professional?: boolean | null }).is_working_professional ?? null,
    studentCount: (studentsByBuddyId.get(b.id) ?? []).length,
  }));

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Students</h1>
        <p className="mt-0.5 text-xs text-stone-500">Dossiers and buddy matching. Mentor profiles live at Buddies → All mentors.</p>
      </div>
      <div className="space-y-6">
        {unmatchedStudents.length > 0 && buddies.length > 0 && (
          <AdminMatchPanel unmatchedStudents={unmatchedStudents} buddies={buddyMatchData} />
        )}
        <div>
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">All students</h2>
          <AdminStudentsList students={studentStats} buddies={buddies} pendingStudents={pendingStudents} />
        </div>
      </div>
    </div>
  );
}
