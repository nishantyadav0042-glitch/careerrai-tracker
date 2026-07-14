import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PushGate } from '@/components/push-gate';
import { Users, GraduationCap, Crown, Sparkles, UserPlus, MoonStar, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

function getTodayIST() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}

// ADMIN HOME = SUMMARY ONLY (founder, 14 July v2): "give me numbers, not
// direct access to profiles". Every tile is a count; tapping it opens the
// page where the actual people live. No student lists on this screen, ever —
// it must look identical at 87 leads and at 5,000.
export default async function AdminTodayPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: adminProfile } = await admin.from('profiles').select('role, notif_prefs').eq('id', user.id).single();
  if (adminProfile?.role !== 'admin') redirect('/login');
  const adminPushEnabled = (adminProfile?.notif_prefs as { push?: boolean } | null)?.push === true;

  const today = getTodayIST();
  const todayStartIst = new Date(`${today}T00:00:00+05:30`).toISOString();
  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const twoDaysAgo = new Date(Date.now() - 2 * 86_400_000).toISOString();

  const { data: people } = await admin
    .from('profiles')
    .select('id, role, created_at, is_premium, premium_since, last_seen_at, call_feedback, is_test_account')
    .in('role', ['student', 'buddy']);
  const rows = (people ?? []).filter((p) => !p.is_test_account);
  const students = rows.filter((p) => p.role === 'student');
  const buddies = rows.filter((p) => p.role === 'buddy');

  const isToday = (iso: string | null | undefined) =>
    !!iso && new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today;

  const totalStudents = students.length;
  const upgraded = students.filter((s) => s.is_premium === true).length;
  const upgradedToday = students.filter((s) => s.is_premium === true && isToday(s.premium_since as string | null)).length;
  const newLeadsToday = students.filter((s) => isToday(s.created_at as string | null)).length;
  const inactiveBuddies = buddies.filter((b) => !b.last_seen_at || (b.last_seen_at as string) < twoDaysAgo).length;
  const hotLeads = students.filter((s) => ((s.call_feedback as { disposition?: string } | null)?.disposition ?? '').toUpperCase() === 'HOT').length;

  const [{ count: loggedToday }, { data: streaks }] = await Promise.all([
    admin.from('daily_reports').select('student_id', { count: 'exact', head: true }).gte('created_at', todayStartIst),
    admin.from('streak_data').select('student_id, last_log_date'),
  ]);
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const studentIds = new Set(students.map((s) => s.id));
  const goingCold = (streaks ?? []).filter((r) => {
    if (!studentIds.has(r.student_id as string) || !r.last_log_date) return false;
    const days = Math.floor((todayMs - new Date(r.last_log_date + 'T00:00:00').getTime()) / 86_400_000);
    return days >= 4;
  }).length;

  const tiles = [
    { label: 'Total students', val: totalStudents, icon: Users, href: '/admin/students', accent: 'text-stone-900' },
    { label: 'Upgraded students', val: upgraded, icon: Crown, href: '/admin/payments', accent: 'text-violet-700' },
    { label: 'Total buddies', val: buddies.length, icon: GraduationCap, href: '/admin/students', accent: 'text-stone-900' },
    { label: 'Upgraded today', val: upgradedToday, icon: Sparkles, href: '/admin/payments', accent: upgradedToday > 0 ? 'text-emerald-700' : 'text-stone-900' },
    { label: 'New leads today', val: newLeadsToday, icon: UserPlus, href: '/admin/leads', accent: newLeadsToday > 0 ? 'text-teal-700' : 'text-stone-900' },
    { label: 'Buddies silent 2+ days', val: inactiveBuddies, icon: MoonStar, href: '/admin/students', accent: inactiveBuddies > 0 ? 'text-rose-600' : 'text-emerald-700' },
  ];

  const attention = [
    { label: 'Logged today', val: `${loggedToday ?? 0}/${totalStudents}`, href: '/admin/students', hot: false },
    { label: 'HOT from AI calls', val: hotLeads, href: '/admin/sales-queue', hot: hotLeads > 0 },
    { label: 'Going cold (4+ days)', val: goingCold, href: '/admin/leads', hot: goingCold > 0 },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Dashboard</h1>
        <p className="mt-0.5 text-xs text-stone-500">{new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Kolkata' })} · tap any number to open the list behind it</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map(({ label, val, icon: Icon, href, accent }) => (
          <Link key={label} href={href} className="group rounded-2xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-400">
            <Icon className={cn('mb-2 h-4 w-4', accent)} />
            <div className={cn('font-mono text-3xl font-bold leading-none', accent)}>{val}</div>
            <div className="mt-1.5 flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-500">{label}</span>
              <ArrowRight className="h-3 w-3 text-stone-300 transition-transform group-hover:translate-x-0.5 group-hover:text-stone-500" />
            </div>
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-1.5">
        {attention.map(({ label, val, href, hot }) => (
          <Link
            key={label}
            href={href}
            className={cn(
              'flex items-center justify-between rounded-xl border p-3 text-sm font-semibold transition-colors',
              hot ? 'border-orange-200 bg-orange-50 text-orange-800 hover:border-orange-400' : 'border-stone-200 bg-white text-stone-700 hover:border-stone-400'
            )}
          >
            <span>{label}</span>
            <span className="flex items-center gap-1.5 font-mono">{val} <ArrowRight className="h-3.5 w-3.5 opacity-50" /></span>
          </Link>
        ))}
      </div>

      {!adminPushEnabled && <PushGate mode="staff" />}
    </div>
  );
}
