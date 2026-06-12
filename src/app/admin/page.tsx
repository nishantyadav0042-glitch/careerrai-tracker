import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Logo } from '@/components/logo';
import { LogoutButton } from '@/components/logout-button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AdminBroadcast } from './admin-broadcast';
import { AdminStudentsList } from './admin-students-list';
import { AdminDataImport } from './admin-data-import';
import type { Profile, DailyReport } from '@/types';
import { AlertCircle, CheckCircle2, Clock, Users, TrendingUp, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from('profiles').select('role, full_name').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') redirect('/login');

  // Fetch all profiles
  const { data: allProfiles } = await admin.from('profiles').select('id, role, full_name, email, exam_target, buddy_id').order('role').order('full_name');
  const profiles = (allProfiles ?? []) as Profile[];

  const students = profiles.filter(p => p.role === 'student');
  const buddies = profiles.filter(p => p.role === 'buddy');

  // Fetch last 7 days reports for all students
  const today = getTodayIST();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

  const studentIds = students.map(s => s.id);
  let reports: DailyReport[] = [];
  if (studentIds.length > 0) {
    const { data } = await admin.from('daily_reports').select('*').in('student_id', studentIds).gte('report_date', weekAgoStr);
    reports = (data ?? []) as DailyReport[];
  }

  // Compute per-student stats
  const studentStats = students.map((s) => {
    const reps = reports.filter(r => r.student_id === s.id);
    const lastReport = reps.sort((a, b) => b.report_date.localeCompare(a.report_date))[0];
    const summary = computeSummary(reps, 7);
    const buddy = buddies.find(b => b.id === s.buddy_id);
    const submittedToday = reps.some(r => r.report_date === today);
    return { student: s, summary, lastDate: lastReport?.report_date, buddy, submittedToday, hasRedFlags: summary.redFlags.length > 0 };
  });

  const submittedToday = studentStats.filter(s => s.submittedToday).length;
  const redFlagCount = studentStats.filter(s => s.hasRedFlags).length;
  const onTrack = studentStats.filter(s => s.summary.band === 'On track').length;

  // Buddy performance: feedback volume + response speed over last 14 days
  // eslint-disable-next-line react-hooks/purity
  const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 3600 * 1000).toISOString();
  const { data: recentFeedback } = await admin
    .from('buddy_feedback')
    .select('buddy_id, created_at, feedback_date')
    .gte('created_at', twoWeeksAgo);

  // Churn risk: days since last log per student (beyond the 7-day window = high risk)
  const { data: lastLogs } = studentIds.length > 0
    ? await admin.from('daily_reports').select('student_id, report_date').in('student_id', studentIds).order('report_date', { ascending: false })
    : { data: [] };
  const lastLogByStudent = new Map<string, string>();
  for (const r of lastLogs ?? []) {
    if (!lastLogByStudent.has(r.student_id)) lastLogByStudent.set(r.student_id, r.report_date);
  }
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const churnRisk = students
    .map((s) => {
      const last = lastLogByStudent.get(s.id);
      const daysSince = last ? Math.floor((todayMs - new Date(last + 'T00:00:00').getTime()) / 86400000) : null;
      const buddy = buddies.find(b => b.id === s.buddy_id);
      return { student: s, daysSince, buddy };
    })
    .filter(({ daysSince }) => daysSince === null || daysSince >= 4)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999));

  // Buddy stats
  const buddyStats = buddies.map(b => {
    const myStudents = students.filter(s => s.buddy_id === b.id);
    const myStats = myStudents.map(s => studentStats.find(ss => ss.student.id === s.id)!).filter(Boolean);
    const redFlags = myStats.filter(s => s.hasRedFlags).length;
    const myFeedback = (recentFeedback ?? []).filter(f => f.buddy_id === b.id);
    const gaps = myFeedback
      .map(f => (new Date(f.created_at).getTime() - new Date(f.feedback_date + 'T00:00:00').getTime()) / 3600000)
      .filter(h => h >= 0 && h < 24 * 7);
    const avgResponseHrs = gaps.length > 0 ? Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length)) : null;
    return { buddy: b, studentCount: myStudents.length, redFlags, students: myStudents, feedbackCount: myFeedback.length, avgResponseHrs };
  });

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

        <div className="px-1 mb-6">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Admin dashboard</p>
          <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
            CareerRai Overview
          </h1>
          <p className="text-sm text-stone-500 mt-1">Today: {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-4 gap-3 mb-6">
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
          <Card className="p-5 bg-rose-50 border-rose-200 mb-6">
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
          <Card className="p-5 bg-amber-50 border-amber-200 mb-6">
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

        {/* All students */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">All students</h2>
          <AdminStudentsList students={studentStats} buddies={buddies} />
        </div>

        {/* Buddies */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Buddies</h2>
          <div className="space-y-2">
            {buddyStats.map(({ buddy, studentCount, redFlags, feedbackCount, avgResponseHrs }) => {
              const initials = buddy.full_name[0].toUpperCase();
              return (
                <Card key={buddy.id} className="p-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-gradient-to-br from-orange-600 to-orange-700 rounded-full flex items-center justify-center text-white text-sm font-bold flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-stone-900 text-sm">{buddy.full_name}</span>
                        <Badge color="orange">Buddy</Badge>
                        {redFlags > 0 && <Badge color="red">{redFlags} red flag{redFlags > 1 ? 's' : ''}</Badge>}
                      </div>
                      <div className="text-xs text-stone-500 mt-0.5">{buddy.email} · {studentCount} student{studentCount !== 1 ? 's' : ''}</div>
                      <div className="text-xs text-stone-600 mt-1">
                        {feedbackCount} feedback (14d)
                        {avgResponseHrs !== null && <> · responds in ~{avgResponseHrs}h</>}
                        {feedbackCount === 0 && <span className="text-rose-600 font-medium"> · no recent activity</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Users className="w-4 h-4 text-stone-400" />
                      <span className="text-sm font-bold text-stone-900">{studentCount}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Data Import */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Data management</h2>
          <AdminDataImport />
        </div>

        {/* Broadcast notification */}
        <div className="mb-6">
          <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3 px-1">Broadcast notification</h2>
          <AdminBroadcast recipientIds={[...students.map(s => s.id), ...buddies.map(b => b.id)]} />
        </div>

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
    </div>
  );
}
