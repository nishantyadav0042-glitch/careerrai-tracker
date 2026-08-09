import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty, AdminStat } from '@/components/admin/workspace-shell';
import { CheckCircle2, XCircle, Clock, VideoOff } from 'lucide-react';

export const dynamic = 'force-dynamic';

// EVERY session, and what actually happened to it.
//
// This screen did not exist, and its absence was expensive. On 9 Aug the only
// paying student had been booked into two sessions with her mentor; both were
// marked `expired`, nobody joined either, and there was no surface anywhere in
// the admin panel that would have shown it. It was found by querying the
// database by hand.
//
// `expired` is the number to watch. It does not mean cancelled and it does not
// mean completed — it means the window passed and nobody recorded a thing,
// which is what a no-show looks like from the database's side.

const STATUS: Record<string, { label: string; tone: string; Icon: typeof CheckCircle2 }> = {
  completed: { label: 'completed', tone: 'text-emerald-700 bg-emerald-100', Icon: CheckCircle2 },
  scheduled: { label: 'scheduled', tone: 'text-stone-700 bg-stone-100', Icon: Clock },
  active: { label: 'live', tone: 'text-teal-700 bg-teal-100', Icon: Clock },
  expired: { label: 'expired — nobody joined', tone: 'text-red-700 bg-red-100', Icon: XCircle },
  cancelled: { label: 'cancelled', tone: 'text-stone-500 bg-stone-100', Icon: XCircle },
};

export default async function SessionsPage() {
  const { admin } = await requireAdmin();

  const { data: sessions } = await admin
    .from('video_sessions')
    .select('id, title, scheduled_at, session_status, session_type, duration_minutes, google_meet_link, buddy_id, student_id')
    .order('scheduled_at', { ascending: false })
    .limit(100);

  const ids = [...new Set((sessions ?? []).flatMap((s) => [s.buddy_id, s.student_id]).filter(Boolean))] as string[];
  const { data: people } = ids.length
    ? await admin.from('profiles').select('id, full_name').in('id', ids)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameOf = new Map((people ?? []).map((p) => [p.id, p.full_name ?? '—']));

  const rows = sessions ?? [];
  const done = rows.filter((s) => s.session_status === 'completed').length;
  const expired = rows.filter((s) => s.session_status === 'expired').length;
  const upcoming = rows.filter((s) => s.session_status === 'scheduled' && Date.parse(s.scheduled_at as string) > Date.now()).length;
  const noLink = rows.filter((s) => !s.google_meet_link).length;

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
    });

  return (
    <WorkspaceShell
      workspaceId="buddies"
      activeHref="/admin/buddies/sessions"
      title="Sessions"
      subtitle={`Last ${rows.length} sessions, newest first`}
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AdminStat label="Upcoming" value={upcoming} />
        <AdminStat label="Completed" value={done} tone={done ? 'good' : 'plain'} />
        <AdminStat
          label="Expired"
          value={expired}
          tone={expired ? 'bad' : 'good'}
          hint="Window passed, nobody joined"
        />
        <AdminStat
          label="Booked with no link"
          value={noLink}
          tone={noLink ? 'bad' : 'good'}
          hint="Impossible to join"
        />
      </div>

      {rows.length === 0 ? (
        <AdminEmpty>No sessions have ever been booked.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {rows.map((s) => {
            const st = STATUS[s.session_status as string] ?? STATUS.scheduled;
            return (
              <div key={s.id as string} className="rounded-2xl border border-stone-200 bg-white p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-[14px] font-bold text-stone-900">
                      {nameOf.get(s.buddy_id as string) ?? '—'} × {nameOf.get(s.student_id as string) ?? '—'}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-400">
                      {fmt(s.scheduled_at as string)} · {s.duration_minutes ?? 30} min · {String(s.session_type ?? '')}
                    </p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${st.tone}`}>
                    <st.Icon className="h-3 w-3" /> {st.label}
                  </span>
                </div>
                {!s.google_meet_link && (
                  <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold text-red-600">
                    <VideoOff className="h-3 w-3" /> no meeting link — this session could not be joined
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}
    </WorkspaceShell>
  );
}
