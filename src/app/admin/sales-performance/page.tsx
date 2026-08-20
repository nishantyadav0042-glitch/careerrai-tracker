import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowLeft } from 'lucide-react';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales performance · CareerRai' };

const PRICE = 999;

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

export default async function SalesPerformancePage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  // The rep whose portfolio this is (single sales user today = Priya).
  const { data: reps } = await admin.from('profiles').select('id, email, full_name').eq('role', 'sales').order('created_at', { ascending: true });
  const rep = (reps ?? [])[0] as any;
  const repName = rep?.full_name ?? 'Sales';
  const repEmail = rep?.email ?? '__none__';

  // eslint-disable-next-line react-hooks/purity -- server component, per-request "now" is correct here
  const since7 = new Date(Date.now() - 7 * 86_400_000).toISOString();
  const [{ data: acts }, { data: portfolio }] = await Promise.all([
    // HER calls only.
    admin.from('sales_activity').select('student_id, status, note, created_at').eq('actor', repEmail).gte('created_at', since7).order('created_at', { ascending: false }),
    // HER portfolio = leads she owns.
    admin.from('lead_outreach').select('student_id, status, callback_at, updated_at').eq('owner', repEmail),
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
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>
        <div className="mb-3">
          <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>{repName} — portfolio</h1>
          <p className="mt-0.5 text-xs text-stone-500">Only the leads {repName.split(' ')[0]} owns and works — her book, her numbers.</p>
        </div>

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
      </div>
    </div>
  );
}
