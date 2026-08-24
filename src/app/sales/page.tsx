import { requireSales } from '@/lib/admin-auth';
import { salesPrincipal } from '@/lib/sales-authz';
import { cn } from '@/lib/utils';
import { buildCallQueue } from '@/lib/call-queue';
import { CallDeck } from '@/components/call-deck';
import { getTeamCapacity, BINDING_LABEL } from '@/lib/sales-capacity';
import { MyOutcomes } from '@/components/sales/my-outcomes';
import { interventionPicture, type LedgerRow } from '@/lib/student-success-mis';
import type { ReasonCategory } from '@/lib/intervention-taxonomy';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Calls · CareerRai' };

function istHour(): number {
  return new Date(Date.now() + 5.5 * 3600_000).getUTCHours();
}

export default async function SalesCallsPage() {
  const { user, admin } = await requireSales();

  // A rep sees unclaimed leads + her own book; an admin visiting the rep
  // workspace sees everything (oversight, same as /admin/sales).
  //
  // R3: the identity is profiles.id, never the email. The previous line read
  // `email ?? null`, and a null there granted the oversight frame.
  const principal = await salesPrincipal(admin, user.id);
  // The rep's OWN outcomes, last 30 days. Scoped by rep_id: a rep sees what
  // happened after their calls and never another rep's numbers — there is no
  // leaderboard here, by design.
  const since30 = new Date(Date.now() - 30 * 86_400_000).toISOString();
  const [{ queue, connectedToday, dueNow }, team, myLedger] = await Promise.all([
    buildCallQueue(admin, principal),
    getTeamCapacity(admin),
    admin.from('intervention_ledger')
      .select('student_id, rep_id, lane, reason_category, logged_d3, logged_d7')
      .eq('rep_id', user.id)
      .gte('occurred_at', since30)
      .limit(2000),
  ]);

  // CHECKED: a failed read must not render as "you helped nobody". Null means
  // the strip reports nothing rather than a demoralising fabricated zero.
  const ledgerRows: LedgerRow[] | null = myLedger.error
    ? null
    : (myLedger.data ?? []).map((l) => ({
      studentId: l.student_id as string,
      repId: l.rep_id as string,
      lane: (l.lane as string | null) ?? null,
      reasonCategory: (l.reason_category as ReasonCategory | null) ?? null,
      loggedD3: l.logged_d3 as boolean | null,
      loggedD7: l.logged_d7 as boolean | null,
    }));
  if (myLedger.error) console.error('[sales] own-outcomes read failed:', myLedger.error.message);
  const primeTime = istHour() >= 18 && istHour() < 21;
  // A rep sees only their OWN capacity line — never the team's book.
  const mine = team.find((t) => t.repId === user.id) ?? null;

  return (
    <div>
      <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Your calls</p>
        {/* Framing is momentum, not a ceiling — never anchor a target number. */}
        <h1 className="mt-1 text-2xl font-bold">{connectedToday > 0 ? `${connectedToday} connected today — keep going` : 'Let’s get some conversions'}</h1>
        <p className="mt-1 text-sm text-teal-100">
          {dueNow > 0 ? `${dueNow} callbacks/retries due now · ` : ''}{queue.length} in your queue, highest priority first. Read the brief, call, log the outcome.
        </p>
        <div className={cn('mt-3 rounded-xl px-3 py-2 text-[13px] font-semibold', primeTime ? 'bg-emerald-400/20 text-emerald-100' : 'bg-white/10 text-teal-100')}>
          {primeTime ? '🟢 Prime calling hours (6–9 PM) — best pickup. Push hard now.' : '⏰ Best pickup is 6–9 PM. Work the due callbacks and top leads first.'}
        </div>
      </div>

      {/* The last link in the loop, and the one the rep could not see: what
          happened to the students AFTER the call. Placed above the workload
          line on purpose — outcomes first, throughput second. */}
      {ledgerRows && (
        <div className="mt-3">
          <MyOutcomes
            picture={interventionPicture(ledgerRows, [])}
            sessionsCompleted={null}
          />
        </div>
      )}

      {/* Phase 2B-1: the rep's own workload, one line. Nothing here changes
          how leads reach them — claiming is still manual and unchanged. */}
      {mine?.configured && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-[12px]">
          <span className="font-bold text-stone-800">
            {mine.activeNow} of {mine.capacity} active
          </span>
          <span className={mine.available > 0 ? 'font-semibold text-emerald-700' : 'text-stone-500'}>
            {mine.available} slot{mine.available === 1 ? '' : 's'} free
          </span>
          {mine.dormantCount > 0 && (
            <span className="text-stone-500">{mine.dormantCount} healthy (no work needed)</span>
          )}
          {mine.overflow > 0 && (
            <span className="font-bold text-rose-700">{mine.overflow} over capacity — work through these first</span>
          )}
          <span className="text-stone-400">· {BINDING_LABEL[mine.binding]}</span>
        </div>
      )}

      <div className="mt-4">
        {queue.length === 0 ? (
          <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
            No one to call right now. Callbacks and fresh leads roll in through the day — check back this evening.
          </div>
        ) : (
          <CallDeck queue={queue} />
        )}
      </div>
    </div>
  );
}
