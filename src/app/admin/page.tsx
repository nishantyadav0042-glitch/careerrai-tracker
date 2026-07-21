import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { PushGate } from '@/components/push-gate';
import { TestPushButton } from '@/components/test-push-button';
import { StreakRestoreBroadcastButton } from '@/components/streak-restore-broadcast-button';
import { Users, GraduationCap, Crown, Sparkles, UserPlus, MoonStar, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStreakBreakers } from '@/lib/streak-breakers';
import { getRealStudents, getLoggedToday, getStreaksAlive, getRemindToLog, getSalesReadyToCall, getGoingCold, getWantsBuddy } from '@/lib/admin-filters';

// Always render live — the dashboard is a real-time ops panel; a cached copy
// showing stale counts (a payment just made, a fresh log) reads as "broken".
export const dynamic = 'force-dynamic';

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

  const upgraded = students.filter((s) => s.is_premium === true).length;
  const upgradedToday = students.filter((s) => s.is_premium === true && isToday(s.premium_since as string | null)).length;
  const newLeadsToday = students.filter((s) => isToday(s.created_at as string | null)).length;
  const inactiveBuddies = buddies.filter((b) => !b.last_seen_at || (b.last_seen_at as string) < twoDaysAgo).length;

  // Founder rule (20 July): every attention card's count is `list.length` of
  // the SAME shared filter its page renders (lib/admin-filters.ts). No card
  // computes its number one way and its list another — that's how the
  // dashboard contradicted itself.
  const real = await getRealStudents(admin);
  const totalStudents = real.length;
  const [loggedList, aliveList, remindList, streakBreakers, salesList, coldList, wantsBuddyList] = await Promise.all([
    getLoggedToday(admin, real),
    getStreaksAlive(admin, real),
    getRemindToLog(admin, real),
    getStreakBreakers(admin),
    getSalesReadyToCall(admin, real),
    getGoingCold(admin, real),
    getWantsBuddy(admin),
  ]);
  const loggedToday = loggedList.length;
  const salesReadyToCall = salesList.length;

  const tiles = [
    { label: 'Total students', val: totalStudents, icon: Users, href: '/admin/students', accent: 'text-stone-900' },
    { label: 'Upgraded students', val: upgraded, icon: Crown, href: '/admin/payments', accent: 'text-violet-700' },
    { label: 'Total buddies', val: buddies.length, icon: GraduationCap, href: '/admin/students', accent: 'text-stone-900' },
    { label: 'Upgraded today', val: upgradedToday, icon: Sparkles, href: '/admin/payments', accent: upgradedToday > 0 ? 'text-emerald-700' : 'text-stone-900' },
    { label: 'New leads today', val: newLeadsToday, icon: UserPlus, href: '/admin/leads', accent: newLeadsToday > 0 ? 'text-teal-700' : 'text-stone-900' },
    { label: 'Buddies silent 2+ days', val: inactiveBuddies, icon: MoonStar, href: '/admin/students', accent: inactiveBuddies > 0 ? 'text-rose-600' : 'text-emerald-700' },
  ];

  const attention = [
    { label: 'Logged today', val: `${loggedToday}/${totalStudents}`, href: '/admin/logged-today', hot: false },
    { label: 'Streaks alive (incl. 🛡️ shield-protected)', val: aliveList.length, href: '/admin/live-streaks', hot: false },
    { label: 'Remind to log today', val: remindList.length, href: '/admin/reminders', hot: remindList.length > 0 },
    { label: '🛡️ Shield used yesterday — win them back', val: streakBreakers.length, href: '/admin/streak-breakers', hot: streakBreakers.length > 0 },
    { label: 'Sales-ready to call', val: salesReadyToCall, href: '/admin/sales-queue', hot: salesReadyToCall > 0 },
    { label: '💛 Want a buddy — said yes at signup', val: wantsBuddyList.length, href: '/admin/wants-buddy', hot: wantsBuddyList.length > 0 },
    { label: 'Going cold (4+ days)', val: coldList.length, href: '/admin/going-cold', hot: coldList.length > 0 },
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

      {/* Momentum Shield announcement — tells every student their streak is
          restored (loggers) or that 3 shields are waiting (never-logged), via
          in-app bell + push where notifications are on. Idempotent. */}
      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-sm font-semibold text-stone-900">Momentum Shield announcement</p>
        <p className="mb-3 mt-0.5 text-xs text-stone-500">
          One tap: students who logged before hear “your streak is restored — start from today”; everyone else gets “3 shields waiting, start tonight”. Nobody is messaged twice.
        </p>
        <StreakRestoreBroadcastButton />
      </div>

      {/* One-tap end-to-end push verification (founder: "I didn't get a single
          notification"). Confirms subscription → FCM → device on demand. */}
      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-sm font-semibold text-stone-900">Notification self-test</p>
        <p className="mb-3 mt-0.5 text-xs text-stone-500">
          Enable push above (in the installed app), then fire a test to confirm it reaches your phone.
        </p>
        <TestPushButton />
      </div>
    </div>
  );
}
