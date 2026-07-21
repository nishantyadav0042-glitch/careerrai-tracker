import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { getLeadsBoard, getCallbacksDue } from '@/lib/sales-queue';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — Summary · CareerRai' };

const PRICE = 999;

export default async function SalesSummaryPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'sales' && me?.role !== 'admin') redirect('/login');

  const [board, callbacks] = await Promise.all([getLeadsBoard(admin), getCallbacksDue(admin)]);

  // Today's activity from the append-only log.
  const todayIso = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const { data: acts } = await admin.from('sales_activity').select('status, created_at');
  const actsList = (acts ?? []) as { status: string | null; created_at: string }[];
  const todays = actsList.filter((a) => new Date(a.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === todayIso);
  const countBy = (s: string) => todays.filter((a) => a.status === s).length;

  const hot = board.filter((b) => b.tier === 'hot').length;
  const warm = board.filter((b) => b.tier === 'warm').length;
  const interested = board.filter((b) => b.status === 'interested').length;
  const followUp = board.filter((b) => b.status === 'follow_up').length;
  const convertedToday = countBy('converted');
  const callsToday = todays.length;

  const tiles = [
    { label: 'Open leads', val: board.length, sub: `${hot} hot · ${warm} warm` },
    { label: 'Callbacks due', val: callbacks.length, sub: 'promised — call now', hot: callbacks.length > 0 },
    { label: 'Calls today', val: callsToday, sub: 'logged' },
    { label: 'Converted today', val: convertedToday, sub: `Rs ${(convertedToday * PRICE).toLocaleString('en-IN')}`, good: convertedToday > 0 },
    { label: 'Interested', val: interested, sub: `pipeline Rs ${(interested * PRICE).toLocaleString('en-IN')}` },
    { label: 'Follow-ups', val: followUp, sub: 'scheduled' },
  ];

  const top = board.slice(0, 8);

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Summary</h1>
        <p className="mt-0.5 text-xs text-stone-500">Your book of business, at a glance. Rs {PRICE} per Exam Buddy.</p>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {tiles.map((t) => (
          <div key={t.label} className={cn('rounded-2xl border bg-white p-3.5', t.hot ? 'border-rose-200' : t.good ? 'border-emerald-200' : 'border-stone-200')}>
            <div className={cn('text-2xl font-extrabold tabular-nums', t.hot ? 'text-rose-600' : t.good ? 'text-emerald-600' : 'text-stone-900')}>{t.val}</div>
            <div className="text-[11px] font-semibold text-stone-600">{t.label}</div>
            <div className="text-[10px] text-stone-400">{t.sub}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Call these first</p>
        <div className="space-y-1.5">
          {top.map((r) => (
            <Link key={r.studentId} href={`/sales/student/${r.studentId}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 hover:bg-stone-50">
              <span className="truncate text-sm font-semibold text-stone-800">{r.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <span className="text-[11px] text-stone-500">{r.lastActivity}</span>
                <span className="font-mono text-sm font-bold text-stone-900">{r.convScore}</span>
                <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold', r.tier === 'hot' ? 'bg-rose-50 text-rose-700' : r.tier === 'warm' ? 'bg-amber-50 text-amber-800' : 'bg-stone-100 text-stone-500')}>{r.tier.toUpperCase()}</span>
              </span>
            </Link>
          ))}
        </div>
        <Link href="/sales/leads" className="mt-2 inline-block text-[12px] font-semibold text-teal-700">See all leads →</Link>
      </div>
    </div>
  );
}
