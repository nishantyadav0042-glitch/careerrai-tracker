import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { computeSummary } from '@/lib/analytics';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { PushGate } from '@/components/push-gate';
import type { Profile, DailyReport } from '@/types';
import { AlertCircle, CheckCircle2, Clock, Users, UserPlus, PhoneCall, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// TODAY — the founder's morning action center (reorg, 14 July). One question
// only: "what needs me right now?" Signups since midnight, who's on fire,
// who's going cold. Everything else (student dossiers, buddies, tools) lives
// on its own nav page — this screen stays short on purpose.
export default async function AdminTodayPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from('profiles').select('role, notif_prefs').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') redirect('/login');
  const adminPushEnabled = (adminProfile?.notif_prefs as { push?: boolean } | null)?.push === true;

  const { data: allProfiles } = await admin
    .from('profiles')
    .select('id, role, full_name, phone, buddy_id, created_at, app_installed, notif_prefs, expedify_status, call_feedback, is_test_account')
    .order('created_at', { ascending: false });
  const profiles = (allProfiles ?? []) as unknown as (Profile & {
    created_at?: string;
    expedify_status?: string | null;
    call_feedback?: { disposition?: string | null } | null;
    is_test_account?: boolean | null;
  })[];
  const students = profiles.filter((p) => p.role === 'student' && !p.is_test_account);
  const buddyById = new Map(profiles.filter((p) => p.role === 'buddy').map((b) => [b.id, b]));

  const today = getTodayIST();
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekAgoStr = weekAgo.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const studentIds = students.map((s) => s.id);

  const [{ data: reportsData }, { data: lastLogs }] = await Promise.all([
    studentIds.length
      ? admin.from('daily_reports').select('student_id, report_date, study_duration, confidence, stress, sleep_quality, overall_energy, mock_taken, total_accuracy').in('student_id', studentIds).gte('report_date', weekAgoStr)
      : Promise.resolve({ data: [] as DailyReport[] }),
    studentIds.length
      ? admin.from('streak_data').select('student_id, last_log_date').in('student_id', studentIds)
      : Promise.resolve({ data: [] }),
  ]);
  const reports = (reportsData ?? []) as DailyReport[];

  const reportsByStudentId = new Map<string, DailyReport[]>();
  for (const r of reports) {
    if (!reportsByStudentId.has(r.student_id)) reportsByStudentId.set(r.student_id, []);
    reportsByStudentId.get(r.student_id)!.push(r);
  }

  const studentStats = students.map((s) => {
    const reps = reportsByStudentId.get(s.id) ?? [];
    const summary = computeSummary(reps, 7);
    return {
      student: s,
      summary,
      submittedToday: reps.some((r) => r.report_date === today),
      hasRedFlags: summary.redFlags.length > 0,
    };
  });

  const signupsToday = students.filter((s) => s.created_at && new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today).length;
  const submittedToday = studentStats.filter((s) => s.submittedToday).length;
  const redFlagged = studentStats.filter((s) => s.hasRedFlags);
  const hotLeads = students.filter((s) => (s.call_feedback?.disposition ?? '').toUpperCase() === 'HOT');

  const lastLogByStudent = new Map<string, string>();
  for (const r of lastLogs ?? []) {
    if (r.last_log_date) lastLogByStudent.set(r.student_id as string, r.last_log_date as string);
  }
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const churnRisk = students
    .map((s) => {
      const last = lastLogByStudent.get(s.id);
      const daysSince = last ? Math.floor((todayMs - new Date(last + 'T00:00:00').getTime()) / 86400000) : null;
      return { student: s, daysSince, buddy: buddyById.get(s.buddy_id ?? '') };
    })
    .filter(({ daysSince }) => daysSince !== null && daysSince >= 4)
    .sort((a, b) => (b.daysSince ?? 999) - (a.daysSince ?? 999))
    .slice(0, 8);

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Today</h1>
        <p className="mt-0.5 text-xs text-stone-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })}</p>
      </div>

      {/* The four numbers that matter each morning */}
      <div className="mb-4 grid grid-cols-4 gap-2">
        {[
          { icon: UserPlus, label: 'Signups today', val: signupsToday, color: signupsToday > 0 ? 'text-teal-700' : 'text-stone-900' },
          { icon: CheckCircle2, label: 'Logged today', val: submittedToday, color: 'text-emerald-700' },
          { icon: AlertCircle, label: 'Red flags', val: redFlagged.length, color: redFlagged.length > 0 ? 'text-rose-600' : 'text-stone-900' },
          { icon: Users, label: 'Students', val: students.length, color: 'text-stone-900' },
        ].map(({ icon: Icon, label, val, color }) => (
          <Card key={label} className="p-3 text-center">
            <Icon className={cn('mx-auto mb-1 h-4 w-4', color)} />
            <div className={cn('font-mono text-xl font-bold', color)}>{val}</div>
            <div className="mt-0.5 text-[9px] font-semibold uppercase tracking-wide text-stone-500">{label}</div>
          </Card>
        ))}
      </div>

      {/* HOT leads from Riya's calls — same-day follow-up is the rule */}
      {hotLeads.length > 0 && (
        <Card className="mb-4 border-orange-200 bg-orange-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <PhoneCall className="h-4 w-4 text-orange-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-orange-700">HOT from AI calls — call them today</span>
          </div>
          <div className="space-y-1.5">
            {hotLeads.map((s) => (
              <Link key={s.id} href={`/admin/leads/${s.id}`} className="flex items-center justify-between rounded-xl border border-orange-100 bg-white p-2.5 transition-colors hover:border-orange-300">
                <span className="text-sm font-semibold text-stone-900">{s.full_name}</span>
                <span className="text-xs text-stone-500">{s.phone}</span>
              </Link>
            ))}
          </div>
        </Card>
      )}

      {/* Red flags */}
      {redFlagged.length > 0 && (
        <Card className="mb-4 border-rose-200 bg-rose-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-rose-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-rose-700">Students needing attention</span>
          </div>
          <div className="space-y-1.5">
            {redFlagged.map(({ student, summary }) => (
              <div key={student.id} className="flex items-start justify-between rounded-xl border border-rose-100 bg-white p-2.5">
                <div>
                  <div className="text-sm font-semibold text-stone-900">{student.full_name}</div>
                  <ul className="mt-0.5 space-y-0.5">
                    {summary.redFlags.map((f, i) => (
                      <li key={i} className="flex items-center gap-1 text-xs text-rose-700"><span>•</span>{f}</li>
                    ))}
                  </ul>
                </div>
                <Badge color="red">{summary.overallScore}/100</Badge>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Going cold */}
      {churnRisk.length > 0 && (
        <Card className="mb-4 border-amber-200 bg-amber-50 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-700">Going cold — 4+ days silent</span>
          </div>
          <div className="space-y-1.5">
            {churnRisk.map(({ student, daysSince, buddy }) => (
              <Link key={student.id} href={`/admin/leads/${student.id}`} className="flex items-center justify-between rounded-xl border border-amber-100 bg-white p-2.5 transition-colors hover:border-amber-300">
                <div>
                  <div className="text-sm font-semibold text-stone-900">{student.full_name}</div>
                  <div className="text-xs text-stone-500">{buddy ? `Buddy: ${buddy.full_name}` : 'No buddy'}</div>
                </div>
                <Badge color={(daysSince ?? 99) >= 7 ? 'red' : 'amber'}>{daysSince}d silent</Badge>
              </Link>
            ))}
          </div>
        </Card>
      )}

      <Link href="/admin/leads" className="flex items-center justify-between rounded-2xl border border-stone-200 bg-white p-4 text-sm font-semibold text-stone-800 transition-colors hover:border-stone-400">
        Work the full lead list <ArrowRight className="h-4 w-4" />
      </Link>

      {!adminPushEnabled && <PushGate mode="staff" />}
    </div>
  );
}
