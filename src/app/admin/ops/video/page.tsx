import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminStat, AdminEmpty } from '@/components/admin/workspace-shell';

export const dynamic = 'force-dynamic';

// Session + video health.
//
// /api/admin/video-health has existed for a while and NOTHING has ever called
// it. On 9 Aug the only paying student had two sessions expire with nobody
// joining, and finding that required querying the database by hand — while an
// endpoint built to answer exactly that question sat unlinked.
//
// Twelve of thirty-one admin APIs were in that state. This page and the
// integrity one next door bring the two that matter most into the panel.
export default async function VideoHealthPage() {
  const { admin } = await requireAdmin();

  const since = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const { data: sessions } = await admin
    .from('video_sessions')
    .select('session_status, google_meet_link, scheduled_at')
    .gte('scheduled_at', since);

  const rows = sessions ?? [];
  const done = rows.filter((s) => s.session_status === 'completed').length;
  const expired = rows.filter((s) => s.session_status === 'expired').length;
  const noLink = rows.filter((s) => !s.google_meet_link).length;
  const finished = done + expired;
  const showRate = finished > 0 ? Math.round((done / finished) * 100) : null;

  return (
    <WorkspaceShell
      workspaceId="ops"
      activeHref="/admin/ops/video"
      title="Session health"
      subtitle="Last 30 days of booked sessions"
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <AdminStat label="Booked" value={rows.length} />
        <AdminStat label="Completed" value={done} tone={done ? 'good' : 'plain'} />
        <AdminStat label="Expired" value={expired} tone={expired ? 'bad' : 'good'} hint="Nobody joined" />
        <AdminStat
          label="Show rate"
          value={showRate == null ? '—' : `${showRate}%`}
          tone={showRate == null ? 'plain' : showRate >= 70 ? 'good' : showRate >= 40 ? 'warn' : 'bad'}
          hint="Completed of all finished sessions"
        />
      </div>

      {noLink > 0 && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 p-3.5">
          <p className="text-[13px] font-bold text-red-800">{noLink} session{noLink === 1 ? '' : 's'} booked with no meeting link</p>
          <p className="mt-1 text-[11.5px] leading-relaxed text-red-700">
            These could never have been joined by anyone. A mentor with no room set is the usual
            cause — check the mentor roster.
          </p>
        </div>
      )}

      {rows.length === 0 && <AdminEmpty>No sessions booked in the last 30 days.</AdminEmpty>}
    </WorkspaceShell>
  );
}
