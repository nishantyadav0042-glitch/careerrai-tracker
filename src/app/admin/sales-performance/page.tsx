import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import { WorkspaceShell } from '@/components/admin/workspace-shell';
import { SESSION_PRICE_PAISE } from '@/lib/session-credit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales performance · CareerRai' };

// The one price a counsellor actually pitches — the single session — imported
// from the same constant checkout charges.
//
// This was a hard-coded 999, and it is the SECOND time that literal has been
// found on a rep surface: lib/sales-portfolio.ts carries a comment about
// fixing exactly this in the 24 Aug research pass, and the copy on this screen
// survived because the two files were never compared. It valued the pipeline
// against an offer the script does not make, and it escaped the pricing sweep
// because that guard matches paise (99900) and display strings ("₹999"), not a
// bare rupee integer — a gap now closed by price-authority.guard.test.ts.
const PRICE = SESSION_PRICE_PAISE / 100;

/* eslint-disable @typescript-eslint/no-explicit-any */
function istDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
}
function istWhen(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
}
const OUTCOME_LABEL: Record<string, string> = {
  interested: 'Interested', callback: 'Callback', follow_up: 'Callback', converted: 'Converted ✓', not_interested: 'Not interested', no_answer: 'No answer', called: 'Called',
};

interface Tally {
  attempts: number; connected: number; noAns: number; converted: number;
  interested: number; callback: number; connectRate: number; convRate: number;
}
function tally(rows: any[]): Tally {
  const c = (s: string) => rows.filter((r) => r.status === s).length;
  const attempts = rows.length;
  const noAns = c('no_answer');
  const connected = attempts - noAns;
  const converted = c('converted');
  return {
    attempts, connected, noAns, converted,
    interested: c('interested'), callback: c('callback'),
    connectRate: attempts ? Math.round((connected / attempts) * 100) : 0,
    convRate: connected ? Math.round((converted / connected) * 100) : 0,
  };
}

function ActivityRow({ title, s }: { title: string; s: Tally }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">{title}</p>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
        {[
          { l: 'Calls', v: s.attempts, sub: undefined as string | undefined, good: false },
          { l: 'Connected', v: s.connected, sub: `${s.connectRate}%`, good: false },
          { l: 'Interested', v: s.interested, sub: undefined, good: false },
          { l: 'Callbacks', v: s.callback, sub: undefined, good: false },
          { l: 'Marked converted', v: s.converted, sub: `${s.convRate}%`, good: s.converted > 0 },
        ].map((x) => (
          <div key={x.l} className="rounded-xl bg-stone-50 border border-stone-100 p-2.5">
            <div className={cn('text-xl font-extrabold tabular-nums', x.good ? 'text-emerald-600' : 'text-stone-900')}>{x.v}</div>
            <div className="text-[10px] font-semibold text-stone-500">{x.l}</div>
            {x.sub && <div className="text-[9px] text-stone-400">{x.sub}</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default async function SalesPerformancePage({ searchParams }: { searchParams: Promise<{ rep?: string }> }) {
  const { admin } = await requireAdmin();
  const { rep: requestedRep } = await searchParams;

  // WHOSE portfolio this is.
  //
  // This used to be `.eq('role','sales')` then `[0]` — written when there was
  // exactly one rep, and silently wrong the moment there were two: the second
  // hire's entire book became invisible on the one screen that shows a rep's
  // book, with no indication anyone was missing. A part-time rep created after
  // the full-time one sorts second by created_at, so they would have been the
  // one who vanished.
  const { data: reps } = await admin
    .from('profiles').select('id, email, full_name')
    .in('role', ['sales', 'admin'])
    .order('full_name', { ascending: true });
  const repList = (reps ?? []) as any[];
  const rep = (requestedRep ? repList.find((r) => r.id === requestedRep) : null) ?? repList[0];
  const repName = rep?.full_name ?? 'Sales';
  // R3: activity and ownership are keyed on profiles.id, not the email.
  const repId = (rep?.id as string | undefined) ?? '__none__';

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: acts }, { data: portfolio }] = await Promise.all([
    // HER calls only.
    admin.from('sales_activity').select('student_id, status, note, created_at').eq('actor_id', repId).gte('created_at', since7).order('created_at', { ascending: false }),
    // HER portfolio = leads she owns.
    admin.from('lead_outreach').select('student_id, status, callback_at, updated_at').eq('owner_id', repId),
  ]);
  const actList = (acts ?? []) as any[];
  const port = (portfolio ?? []) as any[];

  // SA-1E: WON is the payment ledger, never the typed disposition.
  const portIds = port.map((p) => p.student_id);
  const { data: paidRows } = portIds.length
    ? await admin.from('student_payments').select('student_id, amount').eq('status', 'paid').in('student_id', portIds)
    : { data: [] as any[] };
  const paidSet = new Set((paidRows ?? []).map((r: any) => r.student_id as string));
  const won = port.filter((p) => paidSet.has(p.student_id)).length;
  const bookedRs = Math.round(((paidRows ?? []) as any[]).reduce((a, r) => a + ((r.amount as number | null) ?? 0), 0) / 100);

  const ids = [...new Set([...actList.map((a) => a.student_id), ...port.map((p) => p.student_id)])];
  const { data: profs } = ids.length ? await admin.from('profiles').select('id, full_name').in('id', ids) : { data: [] as any[] };
  const nameById = new Map((profs ?? []).map((p: any) => [p.id, p.full_name ?? 'Student']));

  const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const today = actList.filter((a) => istDate(a.created_at) === todayIst);

  // Portfolio breakdown by CURRENT status of her owned leads.
  const pc = (s: string) => port.filter((p) => p.status === s).length;
  const interested = pc('interested');
  const callbacks = pc('follow_up');
  const notInterested = pc('not_interested');
  const working = port.length - won - notInterested;

  return (
    <WorkspaceShell
      workspaceId="sales"
      activeHref="/admin/sales-performance"
      title={`${repName} — portfolio`}
      subtitle={`Only the leads ${repName.split(' ')[0]} owns and works — their book, their numbers.`}
    >
        {repList.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {repList.map((r: any) => (
              <Link key={r.id} href={`/admin/sales-performance?rep=${r.id}`}
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${r.id === rep?.id ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
                {r.full_name ?? r.email ?? r.id}
              </Link>
            ))}
          </div>
        )}

        {/* Her portfolio summary */}
        <div className="rounded-2xl border border-teal-700 bg-teal-700 p-4 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">Portfolio · {port.length} leads</p>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
            {[
              { l: 'Working', v: working },
              { l: 'Interested', v: interested, note: `Rs ${(interested * PRICE).toLocaleString('en-IN')}` },
              { l: 'Callbacks', v: callbacks },
              { l: 'Won (paid)', v: won, note: `Rs ${bookedRs.toLocaleString('en-IN')}` },
              { l: 'Lost', v: notInterested },
            ].map((x) => (
              <div key={x.l} className="rounded-xl bg-white/10 p-2.5">
                <div className="text-xl font-extrabold tabular-nums">{x.v}</div>
                <div className="text-[10px] font-semibold text-teal-100">{x.l}</div>
                {x.note && <div className="text-[9px] text-teal-200">{x.note}</div>}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-3 space-y-3">
          <ActivityRow title="Her calls · today" s={tally(today)} />
          <ActivityRow title="Her calls · last 7 days" s={tally(actList)} />

          <div className="rounded-2xl border border-stone-200 bg-white p-4">
            <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Her recent calls</p>
            {actList.length === 0 ? (
              <p className="text-sm text-stone-400">No calls logged yet.</p>
            ) : (
              <div className="space-y-1.5">
                {actList.slice(0, 30).map((a, i) => (
                  <Link key={i} href={`/admin/student/${a.student_id}`} className="flex items-start justify-between gap-3 rounded-lg px-1 py-1.5 hover:bg-stone-50">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-semibold text-stone-800">{nameById.get(a.student_id) ?? 'Student'} <span className="font-normal text-stone-400">· {OUTCOME_LABEL[a.status] ?? a.status}</span></p>
                      {a.note && <p className="truncate text-[11px] text-stone-500">{a.note}</p>}
                    </div>
                    <span className="shrink-0 font-mono text-[10px] text-stone-400">{istWhen(a.created_at)}</span>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
    </WorkspaceShell>
  );
}
