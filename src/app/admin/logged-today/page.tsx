import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { getLogDateString } from '@/lib/streak-utils';
import { ArrowLeft, Flame, CheckCircle2 } from 'lucide-react';

export const dynamic = 'force-dynamic';

// The list behind the "Logged today" tile — ONLY the students who filled
// today's log (app 3 AM IST log-day), newest first. Previously this tile
// opened the full Students console; the founder wants to see exactly who
// logged, and nothing else.
export default async function LoggedTodayPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const logDay = getLogDateString();

  const { data: reports } = await admin
    .from('daily_reports')
    .select('student_id, created_at, study_duration')
    .eq('report_date', logDay)
    .order('created_at', { ascending: false });

  const ids = [...new Set((reports ?? []).map((r) => r.student_id as string))];
  const [{ data: profs }, { data: streaks }] = await Promise.all([
    ids.length
      ? admin.from('profiles').select('id, full_name, is_test_account, is_demo').in('id', ids)
      : Promise.resolve({ data: [] as { id: string; full_name: string | null; is_test_account: boolean | null; is_demo: boolean | null }[] }),
    ids.length
      ? admin.from('streak_data').select('student_id, current_streak').in('student_id', ids)
      : Promise.resolve({ data: [] as { student_id: string; current_streak: number }[] }),
  ]);
  const profById = new Map((profs ?? []).map((p) => [p.id, p]));
  const streakById = new Map((streaks ?? []).map((s) => [s.student_id, s.current_streak]));

  const fmtTime = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

  const list = (reports ?? [])
    .map((r) => ({ prof: profById.get(r.student_id as string), created_at: r.created_at as string, streak: streakById.get(r.student_id as string) ?? 0 }))
    .filter((r) => r.prof && r.prof.is_test_account !== true && r.prof.is_demo !== true);

  return (
    <div className="mx-auto max-w-2xl px-4 py-5 pb-20">
      <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>
      <div className="mb-4 px-1">
        <h1 className="text-xl font-bold tracking-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Logged today</h1>
        <p className="mt-0.5 text-xs text-stone-500">{list.length} {list.length === 1 ? 'student has' : 'students have'} filled today’s log · newest first</p>
      </div>

      {list.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          No one has logged yet today.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((r, i) => (
            <div key={i} className="flex items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <div className="truncate text-[15px] font-bold text-stone-900">{r.prof!.full_name ?? 'Student'}</div>
                  <div className="mt-0.5 text-[11px] text-stone-400">logged at {fmtTime(r.created_at)}</div>
                </div>
              </div>
              {r.streak >= 1 && (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-700">
                  <Flame className="h-3 w-3" />{r.streak}-day
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
