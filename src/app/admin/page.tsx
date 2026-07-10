import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminBroadcast } from './admin-broadcast';
import { AdminMatchPanel } from './admin-match-panel';
import { AdminStudentsList } from './admin-students-list';
import { AdminBuddiesList, type BuddyDossierData } from './admin-buddies-list';
import { AdminDataImport } from './admin-data-import';
import { AdminAllowlist, type AllowlistRow } from './admin-allowlist';
import { AdminTabs, type AdminTab } from './admin-tabs';
import { PushGate } from '@/components/push-gate';
import type { Profile, DailyReport } from '@/types';
import { AlertCircle, CheckCircle2, Clock, Users, TrendingUp, FileText, IndianRupee, Heart, Ticket, BarChart2, ClipboardList, PhoneCall, BellRing } from 'lucide-react';
import { computeBuddySLA } from '@/lib/buddy-sla';
import { cn } from '@/lib/utils';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default async function AdminPage() {
  // Local JWT verification — middleware already paid the network auth hop.
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from('profiles').select('role, full_name, notif_prefs').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') redirect('/login');

  // Mandatory push for the admin too — this is how new-signup alerts reach them.
  const adminPushEnabled = (adminProfile?.notif_prefs as { push?: boolean } | null)?.push === true;

  // Fetch all profiles — include full onboarding columns so admin can see the
  // complete student dossier (everything they filled across the 9-step setup).
  const { data: allProfiles } = await admin.from('profiles').select('id, role, full_name, email, phone, exam_target, buddy_id, cat_percentile, starting_percentile, onboarding_completed, college, category, is_repeater, is_working_professional, work_ex_months, coaching_enrolled, created_at, course_year, attempt_year, target_percentile, hours_available, study_target_hours, baseline_varc, baseline_dilr, baseline_qa, baseline_mocks_taken, dream_colleges, is_demo, signup_source, strongest_section, student_types_helped, iim_converted, first_attempt_percentile, cat_year, current_company, biggest_mistake, younger_self_advice, how_i_work, linkedin_url, avatar_url').order('created_at', { ascending: false });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const profiles = (allProfiles ?? []) as any as Profile[];

  // People access list (students + buddies)
  const { data: allowlistRows } = await admin
    .from('student_allowlist')
    .select('id, phone, email, full_name, status, assigned_buddy_id, person_type')
    .order('created_at', { ascending: false });

  const students = profiles.filter(p => p.role === 'student');
  const buddies = profiles.filter(p => p.role === 'buddy');

  // Allowlist students who have never logged in (no matching profile row).
  // Match by phone — profile.phone stores +91XXXXXXXXXX, allowlist stores the same.
  const profilePhones = new Set(profiles.map(p => p.phone).filter(Boolean));
  const pendingStudents = (allowlistRows ?? []).filter(r =>
    (r.person_type === 'student' || !r.person_type) &&
    r.phone &&
    !profilePhones.has(r.phone) &&
    r.status !== 'paused'
  );

  // Fetch last 7 days reports for all students
  const today = getTodayIST();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const studentIds = students.map(s => s.id);
  const buddyIds = buddies.map(b => b.id);
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  // These four reads depend only on the id-arrays above — one concurrent
  // wave instead of four serial round-trips.
  const [
    { data: reportsData },
    { data: recentFeedback },
    { data: videoSessions },
    { data: lastLogs },
  ] = await Promise.all([
    studentIds.length > 0
      ? admin.from('daily_reports').select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy').in('student_id', studentIds).gte('report_date', weekAgoStr)
      : Promise.resolve({ data: [] as DailyReport[] }),
    admin
      .from('buddy_feedback')
      .select('buddy_id, created_at, feedback_date')
      .gte('created_at', twoWeeksAgo),
    buddyIds.length > 0
      ? admin.from('video_sessions').select('buddy_id, session_status').in('buddy_id', buddyIds)
      : Promise.resolve({ data: [] }),
    // Churn risk reads streak_data.last_log_date — one indexed row per
    // student, the same source of truth /admin/leads uses — instead of the
    // old approach of scanning every daily_report ever written just to find
    // each student's latest date.
    studentIds.length > 0
      ? admin.from('streak_data').select('student_id, last_log_date').in('student_id', studentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const reports: DailyReport[] = (reportsData ?? []) as DailyReport[];

  // Pre-build Maps — eliminates O(n²) array scans inside the stats loops below
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

  // Compute per-student stats. Join metadata (label + "new" flag) is computed here
  // on the server so the admin list can sort newest-first and badge fresh signups
  // without a client-side Date() that would cause a hydration mismatch.
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
      isDemo: !!(s as Profile & { is_demo?: boolean }).is_demo,
      joinedLabel,
      daysSinceJoin,
      isNew: daysSinceJoin !== null && daysSinceJoin <= 7,
    };
  });
  const studentStatsById = new Map(studentStats.map(ss => [ss.student.id, ss]));

  const submittedToday = studentStats.filter(s => s.submittedToday).length;
  const redFlagCount = studentStats.filter(s => s.hasRedFlags).length;
  const onTrack = studentStats.filter(s => s.summary.band === 'On track').length;

  // Churn risk: days since last log per student (beyond the 7-day window = high risk).
  // recentFeedback / videoSessions / lastLogs were all fetched in the
  // parallel wave above.
  const lastLogByStudent = new Map<string, string>();
  for (const r of lastLogs ?? []) {
    if (r.last_log_date) lastLogByStudent.set(r.student_id, r.last_log_date as string);
  }
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const churnRisk = students
    .map((s) => {
      const last = lastLogByStudent.get(s.id);
      const daysSince = last ? Math.floor((todayMs - new Date(last + 'T00:00:00').getTime()) / 86400000) : null;
      const buddy = buddyById.get(s.buddy_id ?? '');
      return { student: s, daysSince, buddy };
    })
    .filter(({ daysSince }) => daysSince === null || daysSince >= 4)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999));

  // Buddy stats
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

  // ── Tab content sections (grouped to replace the old single long scroll) ──

  const overviewSection = (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { icon: Users, label: 'Students', val: students.length, color: 'text-stone-900' },
          { icon: CheckCircle2, label: 'Reported today', val: submittedToday, color: 'text-emerald-700' },
          { icon: AlertCircle, label: 'Red flags', val: redFlagCount, color: redFlagCount > 0 ? 'text-rose-600' : 'text-stone-900' },
          { icon: TrendingUp, label: 'On track', val: onTrack, color: 'text-teal-700' },
        ].map(({ icon: Icon, label, val, color }) => (
          <Card key={label} className="p-4 text-center">
            <Icon className={cn('w-5 h-5 mx-auto mb-1', color)} />
            <div className={cn('text-2xl font-bold font-mono', color)}>{val}</div>
            <div className="text-[10px] uppercase tracking-wide text-stone-500 font-semibold mt-0.5">{label}</div>
          </Card>
        ))}
      </div>

      {/* Red flags panel */}
      {redFlagCount > 0 && (
        <Card className="p-5 bg-rose-50 border-rose-200">
          <div className="flex items-center gap-2 mb-3">
            <AlertCircle className="w-4 h-4 text-rose-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Students needing attention</span>
          </div>
          <div className="space-y-2">
            {studentStats.filter(s => s.hasRedFlags).map(({ student, summary, buddy }) => (
              <div key={student.id} className="flex items-start justify-between bg-white rounded-xl p-3 border border-rose-100">
                <div>
                  <div className="font-semibold text-stone-900 text-sm">{student.full_name}</div>
                  <div className="text-xs text-stone-500">{buddy ? `Buddy: ${buddy.full_name}` : 'No buddy assigned'}</div>
                  <ul className="mt-1 space-y-0.5">
                    {summary.redFlags.map((f, i) => (
                      <li key={i} className="text-xs text-rose-700 flex items-center gap-1"><span>•</span>{f}</li>
                    ))}
                  </ul>
                </div>
                <Badge color="red">{summary.overallScore}/100</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Churn risk panel */}
      {churnRisk.length > 0 && (
        <Card className="p-5 bg-amber-50 border-amber-200">
          <div className="flex items-center gap-2 mb-3">
            <Clock className="w-4 h-4 text-amber-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Churn risk — inactive students</span>
          </div>
          <div className="space-y-2">
            {churnRisk.map(({ student, daysSince, buddy }) => (
              <div key={student.id} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                <div>
                  <div className="font-semibold text-stone-900 text-sm">{student.full_name}</div>
                  <div className="text-xs text-stone-500">{buddy ? `Buddy: ${buddy.full_name}` : 'No buddy assigned'}</div>
                </div>
                <Badge color={daysSince === null || daysSince >= 7 ? 'red' : 'amber'}>
                  {daysSince === null ? 'Never logged' : `${daysSince}d inactive`}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* System info */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-3">
          <FileText className="w-4 h-4 text-stone-500" />
          <span className="text-xs uppercase tracking-widest text-stone-500 font-semibold">System stats</span>
        </div>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div><div className="text-stone-500 text-xs">Total users</div><div className="font-bold text-stone-900">{profiles.length}</div></div>
          <div><div className="text-stone-500 text-xs">Reports (7d)</div><div className="font-bold text-stone-900">{reports.length}</div></div>
          <div><div className="text-stone-500 text-xs">Active today</div><div className="font-bold text-stone-900">{submittedToday}/{students.length}</div></div>
        </div>
      </Card>
    </div>
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
      {/* Match panel — only shown when there are unmatched students */}
      {unmatchedStudents.length > 0 && buddies.length > 0 && (
        <AdminMatchPanel unmatchedStudents={unmatchedStudents} buddies={buddyMatchData} />
      )}

      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">All students</h2>
        <AdminStudentsList students={studentStats} buddies={buddies} pendingStudents={pendingStudents} />
      </div>

      {/* Buddy SLA Rankings */}
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
                  <div className="w-7 h-7 flex items-center justify-center rounded-full bg-stone-100 text-xs font-bold text-stone-600 flex-shrink-0">
                    #{rank + 1}
                  </div>
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

  const buddiesSection = (
    <div>
      <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Buddies</h2>
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
    </div>
  );

  const accessSection = (
    <div className="space-y-6">
      {/* People access list (students + buddies — OTP allowlist) */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">People access</h2>
        <AdminAllowlist
          rows={(allowlistRows ?? []) as AllowlistRow[]}
          buddies={buddies.map((b) => ({ id: b.id, full_name: b.full_name }))}
        />
      </div>

      {/* Data Import */}
      <div>
        <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Data management</h2>
        <AdminDataImport />
      </div>
    </div>
  );

  const broadcastSection = (
    <div>
      <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Broadcast notification</h2>
      <AdminBroadcast recipientIds={[...students.map(s => s.id), ...buddies.map(b => b.id)]} />
    </div>
  );

  const adminTabs: AdminTab[] = [
    { id: 'overview', label: 'Overview', badge: redFlagCount, content: overviewSection },
    { id: 'students', label: 'Students', badge: students.length + pendingStudents.length, content: studentsSection },
    { id: 'buddies', label: 'Buddies', badge: buddies.length, content: buddiesSection },
    { id: 'access', label: 'People & Data', content: accessSection },
    { id: 'broadcast', label: 'Broadcast', content: broadcastSection },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6 pb-20">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-3">
            <Badge color="stone">Admin</Badge>
            <LogoutButton />
          </div>
        </div>

        <div className="px-1 mb-5">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Admin dashboard</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
            CareerRai Overview
          </h1>
          <p className="text-sm text-stone-500 mt-1">Today: {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {/* Quick links to the dedicated admin pages */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
          <Link
            href="/admin/payments"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2.5 transition-colors"
          >
            <IndianRupee className="w-3.5 h-3.5" /> Payments
          </Link>
          <Link
            href="/admin/scholarships"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2.5 transition-colors"
          >
            <Heart className="w-3.5 h-3.5" /> Scholarships
          </Link>
          <Link
            href="/admin/coupons"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2.5 transition-colors"
          >
            <Ticket className="w-3.5 h-3.5" /> Coupons
          </Link>
          <Link
            href="/admin/cat-leads"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2.5 transition-colors"
          >
            <ClipboardList className="w-3.5 h-3.5" /> CAT Leads
          </Link>
          <Link
            href="/admin/leads"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-100 hover:bg-purple-200 rounded-lg px-3 py-2.5 transition-colors"
          >
            <PhoneCall className="w-3.5 h-3.5" /> Leads
          </Link>
          <Link
            href="/admin/notification-health"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2.5 transition-colors"
          >
            <BellRing className="w-3.5 h-3.5" /> Notif Health
          </Link>
          <Link
            href="/admin/perf"
            className="flex items-center justify-center gap-1.5 text-xs font-semibold text-stone-700 bg-stone-100 hover:bg-stone-200 rounded-lg px-3 py-2.5 transition-colors"
          >
            <BarChart2 className="w-3.5 h-3.5" /> Speed
          </Link>
        </div>

        <AdminTabs tabs={adminTabs} />
      </div>
      {!adminPushEnabled && <PushGate mode="staff" />}
    </div>
  );
}
