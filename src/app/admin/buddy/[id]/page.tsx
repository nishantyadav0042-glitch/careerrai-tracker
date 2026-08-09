import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { resolveEntity } from '@/lib/os/resolve-entity';
import { getEntityTimeline } from '@/lib/os/timeline';
import { EntityNeighbours } from '@/components/admin/entity-neighbours';
import { ArrowLeft, Video, VideoOff, Phone, CheckCircle2, XCircle, Clock } from 'lucide-react';
import { SetRoom } from './set-room';

export const dynamic = 'force-dynamic';

// BUDDY 360 — the mentor's whole operation on one page.
//
// Co-founder rule: "open a buddy — students assigned, workload, sessions,
// completed, missed, availability, notes." Built by reusing the same
// EntityNeighbours the student 360 uses, over the buddy's resolved graph, plus
// the one number that decides everything: can this mentor actually run a
// session? A mentor with students and no room is the state that quietly killed
// two paid sessions, so it leads.

function waDigits(phone: string | null): string | null {
  if (!phone) return null;
  const d = phone.replace(/\D/g, '');
  return d.length >= 10 ? d : null;
}

export default async function Buddy360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { admin } = await requireAdmin();

  const [{ data: profile }, entity, sessions, timeline] = await Promise.all([
    admin.from('profiles')
      .select('full_name, phone, buddy_meet_url, buddy_meet_email, buddy_onboarding_completed')
      .eq('id', id).eq('role', 'buddy').maybeSingle(),
    resolveEntity(admin, 'buddy', id),
    admin.from('video_sessions').select('session_status, scheduled_at').eq('buddy_id', id),
    getEntityTimeline(admin, 'buddy', id, 30),
  ]);

  if (!profile) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-stone-500">
        Mentor not found. <Link href="/admin/buddies" className="underline">Back to roster</Link>
      </div>
    );
  }

  const rows = sessions.data ?? [];
  const now = Date.now();
  const done = rows.filter((s) => s.session_status === 'completed').length;
  const expired = rows.filter((s) => s.session_status === 'expired').length;
  const upcoming = rows.filter((s) => s.session_status === 'scheduled' && Date.parse(s.scheduled_at as string) > now).length;
  const studentCount = entity?.neighbours.find((n) => n.kind === 'student')?.rows.length ?? 0;
  const hasRoom = !!profile.buddy_meet_url;
  const blocked = studentCount > 0 && !hasRoom;
  const wa = waDigits(profile.phone as string | null);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
      <Link href="/admin/buddies" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Roster
      </Link>

      {blocked && (
        <div className="mb-3 rounded-2xl border-2 border-red-400 bg-red-50 p-3.5">
          <p className="text-[14px] font-bold text-red-800">Cannot run a session</p>
          <p className="mt-1 text-[12px] text-red-700">
            {studentCount} student{studentCount === 1 ? '' : 's'} assigned and no meeting room set — booking is refused
            until one exists. Message them their room, or set it from the profile.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-stone-900">{profile.full_name as string}</h1>
            <p className="text-xs text-stone-500">{(profile.phone as string) ?? 'no phone'}</p>
            <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold">
              {hasRoom ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-700"><Video className="h-3 w-3" /> room set</span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-red-700"><VideoOff className="h-3 w-3" /> no room</span>
              )}
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{profile.buddy_onboarding_completed ? 'onboarded' : 'setup incomplete'}</span>
            </div>
          </div>
          {wa && (
            <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#25d366] px-3 py-2 text-[13px] font-bold text-[#04331c] active:scale-95">
              <Phone className="h-3.5 w-3.5" /> WhatsApp
            </a>
          )}
        </div>
        {hasRoom && (
          <div className="mt-3 flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-stone-700">{(profile.buddy_meet_url as string).replace('https://', '')}</span>
            <a href={profile.buddy_meet_url as string} target="_blank" rel="noopener noreferrer" className="shrink-0 text-[11px] font-bold text-teal-700 underline">open</a>
          </div>
        )}
        {/* Set/replace the meeting room from here — the fix for "cannot run a
            session", on the surface that reports it. */}
        <SetRoom buddyId={id} hasRoom={hasRoom} />
      </div>

      {/* Delivery — the numbers that say whether the mentoring is happening */}
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Students" value={studentCount} Icon={undefined} />
        <Stat label="Upcoming" value={upcoming} Icon={Clock} tone="plain" />
        <Stat label="Completed" value={done} Icon={CheckCircle2} tone={done ? 'good' : 'plain'} />
        <Stat label="Expired" value={expired} Icon={XCircle} tone={expired > done ? 'bad' : 'plain'} />
      </div>

      {entity && <EntityNeighbours entity={entity} />}

      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Timeline</p>
        {timeline.length === 0 ? (
          <p className="text-[12px] text-stone-400">No recorded decisions yet.</p>
        ) : (
          <div className="space-y-1.5">
            {timeline.map((t) => (
              <div key={t.id} className="flex items-center justify-between text-[12.5px]">
                <span className="text-stone-700">{t.summary}</span>
                <span className="text-[11px] text-stone-400">{new Date(t.createdAt).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' })}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, Icon, tone = 'plain' }: { label: string; value: number; Icon?: typeof Clock; tone?: 'plain' | 'good' | 'bad' }) {
  const t = tone === 'good' ? 'text-emerald-700' : tone === 'bad' ? 'text-red-600' : 'text-stone-900';
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className={`mt-1 flex items-center gap-1.5 text-[20px] font-bold leading-none ${t}`}>
        {Icon && <Icon className="h-4 w-4" />}{value}
      </p>
    </div>
  );
}
