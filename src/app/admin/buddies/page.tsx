import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import { assembleMentorOps, MENTOR_META, type MentorState } from '@/lib/os/mentor-ops';
import { VideoOff, AlertTriangle, Phone } from 'lucide-react';

export const dynamic = 'force-dynamic';

// MENTOR OPERATIONS — mentors requiring action, nothing else.
//
// Founder, 9 Aug: "Don't build a Mentors page. Build Mentor Operations." The
// same law as People and Revenue, applied to mentor supply: a mentor doing
// their job — room set, no missed sessions, not overloaded, paid up — is
// invisible. Only the ones needing a human surface: can't run a session (no
// room), a missed session, an overload, a payout pending. The "available"
// mentors sit at the bottom because at scale the founder's action there is
// "who can take this premium student". Every row opens the buddy 360.
//
// The cost of not having this was paid the day it was built: Aarav Mehta had
// two students and no meeting room — he could not book a session at all — and
// nothing anywhere said so. This screen surfaces exactly that, first.
const TONE: Record<string, string> = {
  red: 'bg-red-100 text-red-700', amber: 'bg-amber-100 text-amber-800',
  stone: 'bg-stone-100 text-stone-600', green: 'bg-emerald-100 text-emerald-700',
};
const STATES: MentorState[] = ['cant_run_session', 'session_missed', 'overloaded', 'payout_pending', 'available'];

export default async function BuddiesPage({ searchParams }: { searchParams: Promise<{ state?: string }> }) {
  const { admin } = await requireAdmin();
  const { state } = await searchParams;
  const ops = await assembleMentorOps(admin, Date.now());

  const active = STATES.find((s) => s === state) ?? null;
  const rows = active ? ops.items.filter((i) => i.state === active) : ops.items;
  const countOf = (s: MentorState) => ops.items.filter((i) => i.state === s).length;
  // "Requiring action" excludes the available set — those are for assignment,
  // not a task on the founder's plate.
  const needAction = ops.items.filter((i) => i.state !== 'available').length;

  return (
    <WorkspaceShell
      workspaceId="buddies"
      activeHref="/admin/buddies"
      title="Mentor operations"
      subtitle={needAction === 0
        ? `No mentor needs attention — all clear · ${ops.totalMentors} mentor${ops.totalMentors === 1 ? '' : 's'}`
        : `${needAction} mentor${needAction === 1 ? '' : 's'} need you · ${ops.totalMentors} total`}
    >
      {ops.items.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          <Link href="/admin/buddies" className={!active ? 'rounded-lg bg-stone-900 px-2.5 py-1 text-[11.5px] font-semibold text-white' : 'rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-stone-600'}>
            All <span className="opacity-60">{ops.items.length}</span>
          </Link>
          {STATES.map((s) => {
            const n = countOf(s);
            return (
              <Link key={s} href={`/admin/buddies?state=${s}`} className={active === s ? 'rounded-lg bg-stone-900 px-2.5 py-1 text-[11.5px] font-semibold text-white' : `rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-stone-600 ${n === 0 ? 'opacity-40' : ''}`}>
                {MENTOR_META[s].label} <span className="opacity-60">{n}</span>
              </Link>
            );
          })}
        </div>
      )}

      {rows.length === 0 ? (
        <AdminEmpty>Nothing to do here — every mentor is set up and delivering. Go build.</AdminEmpty>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => {
            const m = MENTOR_META[r.state];
            const blocking = r.state === 'cant_run_session';
            return (
              <div key={r.id} className={`rounded-2xl border p-3.5 ${blocking ? 'border-red-300 bg-red-50' : 'border-stone-200 bg-white'}`}>
                <div className="flex items-start gap-2.5">
                  {blocking && <VideoOff className="mt-0.5 h-4 w-4 shrink-0 text-red-600" />}
                  {r.state === 'session_missed' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-[14px] font-bold text-stone-900">{r.name}</p>
                      <span className="shrink-0 text-[11px] text-stone-400">{r.students} student{r.students === 1 ? '' : 's'}</span>
                    </div>
                    <p className="mt-0.5 text-[11.5px] leading-snug text-stone-500">{r.detail}</p>
                  </div>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${TONE[m.tone]}`}>{m.label}</span>
                </div>
                <div className="mt-2.5 flex items-center gap-2 pl-6.5">
                  <Link href={r.route} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-bold text-white">
                    Open →
                  </Link>
                  {r.phone && (
                    <a href={`https://wa.me/${r.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal-700">
                      <Phone className="h-3 w-3" /> Message
                    </a>
                  )}
                </div>
              </div>
            );
          })}
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
