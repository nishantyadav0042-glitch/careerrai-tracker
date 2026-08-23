import { requireAdmin } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import { buildCallQueue } from '@/lib/call-queue';
import { CallDeck } from '@/components/call-deck';
import { WorkspaceShell, AdminEmpty, AdminStat } from '@/components/admin/workspace-shell';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Calls · CareerRai' };

// SA-1B (20 Aug 2026): this page now consumes THE canonical queue authority —
// buildCallQueue, the same function the rep's /sales renders — instead of the
// parallel ranking that used to live in lib/sales-queue. The Part-1 forensic proved the two
// authorities used different suppression clocks and a different door signal,
// so the admin and the rep could be looking at different lists of the same
// students. One queue, two frames: the admin sees exactly what the rep sees.
//
// The generic ready-to-send script deliberately did NOT move here (founder,
// SA-1B): the card's job is who to call, why now, and what action is due —
// the personalized pitch lives on the student drill-down (/sales/student/[id]),
// which every card links to.

function istHour(): number {
  return new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
}

export default async function AdminSalesPage() {
  const { user, admin } = await requireAdmin();

  // R3: oversight is now requested EXPLICITLY by role. It used to be granted by
  // omitting the argument — the same "absence means everything" shape that let a
  // rep with no email inherit this frame on /sales.
  const { queue, connectedToday, dueNow, totalOpen } = await buildCallQueue(admin, {
    id: user.id,
    role: 'admin',
  });
  const primeTime = istHour() >= 18 && istHour() < 21;

  return (
    <WorkspaceShell
      workspaceId="sales"
      activeHref="/admin/sales"
      title="Call queue"
      subtitle="The same list the rep works — highest priority first."
    >
      <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Sales — the calling queue</p>
        <h1 className="mt-1 text-2xl font-bold">{connectedToday > 0 ? `${connectedToday} connected today` : 'Today\u2019s calls'}</h1>
        <p className="mt-1 text-sm text-teal-100">
          {dueNow > 0 ? `${dueNow} callbacks/retries due now \u00b7 ` : ''}{queue.length} in the queue, highest priority first — the same list the rep works.
        </p>
        <div className={cn('mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold', primeTime ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-teal-100')}>
          {primeTime ? '\ud83d\udfe2 Prime calling hours (6\u20139 PM) — best pickup.' : '\u23f0 Best pickup is 6\u20139 PM. Due callbacks and hottest leads first.'}
        </div>
      </div>

      {/* The admin frame: the operation's shape, from the SAME queue build the
          rep works. Every number here is one buildCallQueue call — there is no
          second counting path that could disagree with the list below it. */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        <AdminStat label="Due now" value={dueNow} hint="Callbacks + retries" tone={dueNow > 0 ? 'warn' : 'plain'} />
        <AdminStat label="In today's queue" value={queue.length} hint="Capped rotation" />
        <AdminStat label="Open leads" value={totalOpen} hint="Not converted/closed" />
      </div>

      <div className="mt-4">
        {queue.length === 0 ? (
          <AdminEmpty>
            No one to call right now. Callbacks and fresh leads roll in through the day.
          </AdminEmpty>
        ) : (
          <CallDeck queue={queue} />
        )}
      </div>
    </WorkspaceShell>
  );
}
