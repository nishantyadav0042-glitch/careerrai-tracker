import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty, AdminStat } from '@/components/admin/workspace-shell';
import { Video, VideoOff, AlertTriangle } from 'lucide-react';

export const dynamic = 'force-dynamic';

// BUDDY OPERATIONS — mentor supply, separate from Students.
//
// Founder, 9 Aug: "buddy management is a different operation." It is, and the
// cost of not having this screen was paid the same day: Aarav Mehta had two
// students and no meeting room, which means he could not book a session at
// all, and nothing anywhere said so. Shreya had a room but her two sessions
// with our only paying student both expired with nobody joining.
//
// So the first column here is not a vanity metric. It is "can this mentor
// actually run a session", answered before a student is assigned to them.

interface Row {
  id: string;
  name: string;
  phone: string | null;
  hasRoom: boolean;
  onboarded: boolean;
  students: number;
  sessionsTotal: number;
  sessionsDone: number;
  sessionsExpired: number;
  upcoming: number;
}

export default async function BuddiesPage() {
  const { admin } = await requireAdmin();

  const [{ data: buddies }, { data: students }, { data: sessions }] = await Promise.all([
    admin.from('profiles')
      .select('id, full_name, phone, buddy_meet_url, buddy_onboarding_completed')
      .eq('role', 'buddy')
      .not('is_test_account', 'is', true),
    admin.from('profiles').select('buddy_id').eq('role', 'student').not('buddy_id', 'is', null),
    admin.from('video_sessions').select('buddy_id, session_status, scheduled_at'),
  ]);

  const load = new Map<string, number>();
  for (const s of students ?? []) load.set(s.buddy_id as string, (load.get(s.buddy_id as string) ?? 0) + 1);

  const now = Date.now();
  const byBuddy = new Map<string, { total: number; done: number; expired: number; upcoming: number }>();
  for (const s of sessions ?? []) {
    const k = s.buddy_id as string;
    const cur = byBuddy.get(k) ?? { total: 0, done: 0, expired: 0, upcoming: 0 };
    cur.total++;
    if (s.session_status === 'completed') cur.done++;
    if (s.session_status === 'expired') cur.expired++;
    if (s.session_status === 'scheduled' && Date.parse(s.scheduled_at as string) > now) cur.upcoming++;
    byBuddy.set(k, cur);
  }

  const rows: Row[] = (buddies ?? []).map((b) => {
    const s = byBuddy.get(b.id) ?? { total: 0, done: 0, expired: 0, upcoming: 0 };
    return {
      id: b.id,
      name: (b.full_name as string) ?? 'Buddy',
      phone: b.phone as string | null,
      hasRoom: !!b.buddy_meet_url,
      onboarded: b.buddy_onboarding_completed === true,
      students: load.get(b.id) ?? 0,
      sessionsTotal: s.total,
      sessionsDone: s.done,
      sessionsExpired: s.expired,
      upcoming: s.upcoming,
    };
  })
    // Blocked mentors first: students assigned but unable to run a session.
    .sort((a, b) => {
      const aBlocked = a.students > 0 && !a.hasRoom ? 1 : 0;
      const bBlocked = b.students > 0 && !b.hasRoom ? 1 : 0;
      if (aBlocked !== bBlocked) return bBlocked - aBlocked;
      return b.students - a.students;
    });

  const blocked = rows.filter((r) => r.students > 0 && !r.hasRoom);
  const totalExpired = rows.reduce((n, r) => n + r.sessionsExpired, 0);
  const totalDone = rows.reduce((n, r) => n + r.sessionsDone, 0);

  return (
    <WorkspaceShell
      workspaceId="buddies"
      activeHref="/admin/buddies"
      title="Mentor roster"
      subtitle={`${rows.length} mentors · ${rows.reduce((n, r) => n + r.students, 0)} students assigned`}
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AdminStat label="Mentors" value={rows.length} />
        <AdminStat
          label="Can't run a session"
          value={blocked.length}
          tone={blocked.length ? 'bad' : 'good'}
          hint={blocked.length ? 'Students assigned, no meeting room set' : 'Every loaded mentor has a room'}
        />
        <AdminStat label="Sessions completed" value={totalDone} tone={totalDone ? 'good' : 'plain'} />
        <AdminStat
          label="Sessions expired"
          value={totalExpired}
          tone={totalExpired > totalDone ? 'bad' : 'warn'}
          hint="Nobody joined before the window closed"
        />
      </div>

      {blocked.length > 0 && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-bold text-red-800">
            <AlertTriangle className="h-4 w-4" />
            {blocked.length} mentor{blocked.length === 1 ? '' : 's'} cannot book a session
          </p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-red-700">
            {blocked.map((b) => `${b.name} (${b.students} student${b.students === 1 ? '' : 's'})`).join(', ')}
            {' '}— booking is refused until a meeting room is set on their profile.
          </p>
        </div>
      )}

      {rows.length === 0 ? (
        <AdminEmpty>No mentors yet.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-stone-200 bg-white p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-[15px] font-bold text-stone-900">{r.name}</p>
                  <p className="mt-0.5 text-[11px] text-stone-400">
                    {r.phone ?? 'no phone'} · {r.onboarded ? 'onboarded' : 'setup incomplete'}
                  </p>
                </div>
                {r.hasRoom ? (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-700">
                    <Video className="h-3 w-3" /> room set
                  </span>
                ) : (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-700">
                    <VideoOff className="h-3 w-3" /> no room
                  </span>
                )}
              </div>

              <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-stone-600">
                <span><b className="text-stone-900">{r.students}</b> students</span>
                <span><b className="text-stone-900">{r.upcoming}</b> upcoming</span>
                <span className={r.sessionsDone ? 'text-emerald-700' : ''}>
                  <b>{r.sessionsDone}</b> completed
                </span>
                <span className={r.sessionsExpired ? 'text-red-600' : ''}>
                  <b>{r.sessionsExpired}</b> expired
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      <Link
        href="/admin/buddies/sessions"
        className="mt-4 block rounded-2xl border border-stone-200 bg-white p-3.5 text-center text-[13px] font-semibold text-stone-700 hover:border-stone-400 hover:text-stone-900"
      >
        Every session, and what happened to it →
      </Link>
    </WorkspaceShell>
  );
}
