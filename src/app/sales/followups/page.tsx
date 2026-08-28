import Link from 'next/link';
import { requireSales } from '@/lib/admin-auth';
import { getRepFollowupBoard, type BoardPromise, type BoardLead } from '@/lib/sales-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Follow-ups · CareerRai' };

// ── Every promise this counsellor made, and everyone still waiting ──────────
//
// sales_followup has recorded promises since 23 Aug and the founder's control
// tower reads them. The person who MADE the promise had no screen. This is it.
//
// Ordered by what the founder said matters most — retention and follow-up
// before conversion — so the page opens on what is late, not on what is
// pleasant. Nothing here is a leaderboard and nothing compares one counsellor
// to the other: that is deliberate, and matches the rest of the rep workspace.

function whenIst(iso: string) {
  return new Date(iso).toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short',
    hour: '2-digit', minute: '2-digit',
  });
}

function lateBy(iso: string, nowMs: number) {
  const mins = Math.round((nowMs - Date.parse(iso)) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m late`;
  if (mins < 1440) return `${Math.round(mins / 60)}h late`;
  return `${Math.round(mins / 1440)}d late`;
}

function PromiseRow({ p, nowMs, tone }: { p: BoardPromise; nowMs: number; tone: 'late' | 'now' | 'soon' }) {
  return (
    <Link href={`/sales/student/${p.studentId}`}
      className="flex items-start justify-between gap-3 rounded-lg px-1 py-2 hover:bg-stone-50">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-stone-800">{p.name ?? 'Student'}</p>
        <p className="truncate text-[11px] text-stone-500">
          {p.reason || 'Follow-up'}{p.channel ? ` · ${p.channel}` : ''}
        </p>
      </div>
      <span className={`shrink-0 text-[11px] font-semibold ${
        tone === 'late' ? 'text-rose-700' : tone === 'now' ? 'text-teal-700' : 'text-stone-400'}`}>
        {tone === 'late' ? lateBy(p.dueAt, nowMs) : whenIst(p.dueAt)}
      </span>
    </Link>
  );
}

function WaitingRow({ l }: { l: BoardLead }) {
  const breached = l.sla.state === 'awaiting' && l.sla.breached;
  const mins = l.sla.state === 'awaiting' ? l.sla.workingMinutesElapsed : null;
  return (
    <Link href={`/sales/student/${l.studentId}`}
      className="flex items-start justify-between gap-3 rounded-lg px-1 py-2 hover:bg-stone-50">
      <div className="min-w-0">
        <p className="truncate text-[13px] font-semibold text-stone-800">{l.name ?? 'Student'}</p>
        <p className="truncate text-[11px] text-stone-500">
          {l.sla.state === 'unknown'
            // Never rendered as "0 minutes waiting" — we genuinely do not know.
            ? 'Assigned before we started timing — call when you can'
            : `${mins} working min since you got this lead`}
        </p>
      </div>
      {breached && (
        <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-700">
          call first
        </span>
      )}
    </Link>
  );
}

function Panel({ title, count, children }: { title: string; count: number; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">
        {title} <span className="text-stone-300">· {count}</span>
      </p>
      {children}
    </div>
  );
}

export default async function SalesFollowupsPage() {
  const { user, admin } = await requireSales();
  const nowMs = Date.now();
  const board = await getRepFollowupBoard(admin, user.id, nowMs);

  const promisesUnreadable = board.promises == null;
  const waiting = board.awaitingFirstContact;
  const breachedCount = waiting.filter((l) => l.sla.state === 'awaiting' && l.sla.breached).length;

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Your follow-ups</p>
        <h1 className="mt-1 text-2xl font-bold">
          {promisesUnreadable ? 'Follow-ups didn’t load'
            : board.overdue.length > 0 ? `${board.overdue.length} promise${board.overdue.length === 1 ? '' : 's'} you’re late on`
            : board.today.length > 0 ? `${board.today.length} due today`
            : waiting.length > 0 ? `${waiting.length} waiting for a first call`
            : 'Nothing overdue — good'}
        </h1>
        <p className="mt-1 text-sm text-teal-100">
          A student who hears back when you said they would is a student who stays.
          Retention first, then conversion.
        </p>
      </div>

      {promisesUnreadable ? (
        // The one thing this page must never do is render a failed read as
        // "nothing due". A counsellor would close the tab and three students
        // would go uncalled.
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">We couldn’t load your promises.</p>
          <p className="mt-1 text-[13px] text-amber-800">
            This is not an empty list — it’s a failed read on our side. Refresh,
            and tell Nishant if it keeps happening.
          </p>
        </div>
      ) : (
        <>
          {board.overdue.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-rose-500">
                Overdue · {board.overdue.length}
              </p>
              <div className="divide-y divide-rose-100">
                {board.overdue.map((p) => <PromiseRow key={p.id} p={p} nowMs={nowMs} tone="late" />)}
              </div>
            </div>
          )}

          <Panel title="Due today" count={board.today.length}>
            {board.today.length === 0
              ? <p className="text-sm text-stone-400">Nothing promised for today.</p>
              : <div className="divide-y divide-stone-100">
                  {board.today.map((p) => <PromiseRow key={p.id} p={p} nowMs={nowMs} tone="now" />)}
                </div>}
          </Panel>

          <Panel title="Coming up" count={board.upcoming.length}>
            {board.upcoming.length === 0
              ? <p className="text-sm text-stone-400">Nothing scheduled ahead.</p>
              : <div className="divide-y divide-stone-100">
                  {board.upcoming.slice(0, 25).map((p) => <PromiseRow key={p.id} p={p} nowMs={nowMs} tone="soon" />)}
                </div>}
          </Panel>
        </>
      )}

      <Panel title={breachedCount > 0 ? `Waiting for a first call · ${breachedCount} overdue` : 'Waiting for a first call'}
        count={waiting.length}>
        {board.slaMinutes == null ? (
          <p className="text-sm text-stone-400">
            Your working hours aren’t set up yet, so we can’t tell you which of
            these are overdue. Ask Nishant to set them.
          </p>
        ) : waiting.length === 0 ? (
          <p className="text-sm text-stone-400">Everyone you own has been contacted at least once.</p>
        ) : (
          <>
            <p className="mb-1 text-[11px] text-stone-400">
              Target: first call within {board.slaMinutes} minutes of your working time.
              The clock pauses outside your hours and on your off day.
            </p>
            <div className="divide-y divide-stone-100">
              {waiting.slice(0, 40).map((l) => <WaitingRow key={l.studentId} l={l} />)}
            </div>
          </>
        )}
      </Panel>
    </div>
  );
}
