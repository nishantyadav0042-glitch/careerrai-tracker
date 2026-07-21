import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { getRepPortfolio, getRepCallStats } from '@/lib/sales-portfolio';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My summary · CareerRai' };

export default async function SalesSummaryPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, email').eq('id', user.id).single();
  if (me?.role !== 'sales' && me?.role !== 'admin') redirect('/login');
  const email = (me?.email as string) ?? '__none__';

  const [{ summary: s, leads }, calls] = await Promise.all([
    getRepPortfolio(admin, email),
    getRepCallStats(admin, email),
  ]);
  const inr = (n: number) => `Rs ${n.toLocaleString('en-IN')}`;
  const hottest = leads.filter((l) => l.status === 'interested' || l.status === 'follow_up').slice(0, 8);

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>My summary</h1>
        <p className="mt-0.5 text-xs text-stone-500">Your book of business. Rs 999 per Exam Buddy.</p>
      </div>

      {/* Portfolio */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {[
          { l: 'Working', v: s.working },
          { l: 'Interested', v: s.interested, sub: inr(s.pipeline), tone: 'amber' },
          { l: 'Callbacks', v: s.callbacks, tone: 'sky' },
          { l: 'Won', v: s.converted, sub: inr(s.booked), tone: 'good' },
          { l: 'Lost', v: s.lost },
          { l: 'In my book', v: s.total },
        ].map((t) => (
          <div key={t.l} className={cn('rounded-2xl border bg-white p-3.5', t.tone === 'good' ? 'border-emerald-200' : t.tone === 'amber' ? 'border-amber-200' : t.tone === 'sky' ? 'border-sky-200' : 'border-stone-200')}>
            <div className={cn('text-2xl font-extrabold tabular-nums', t.tone === 'good' ? 'text-emerald-600' : 'text-stone-900')}>{t.v}</div>
            <div className="text-[11px] font-semibold text-stone-600">{t.l}</div>
            {t.sub && <div className="text-[10px] text-stone-400">{t.sub}</div>}
          </div>
        ))}
      </div>

      {/* My calls */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">My calls</p>
        <div className="grid grid-cols-2 gap-3">
          {[{ t: 'Today', c: calls.today }, { t: 'Last 7 days', c: calls.week }].map(({ t, c }) => (
            <div key={t} className="rounded-xl bg-stone-50 border border-stone-100 p-3">
              <p className="text-[11px] font-bold text-stone-500">{t}</p>
              <p className="mt-1 text-lg font-extrabold text-stone-900">{c.attempts} <span className="text-xs font-semibold text-stone-400">calls</span></p>
              <p className="text-[11px] text-stone-500">{c.connected} connected · {c.converted} won</p>
            </div>
          ))}
        </div>
      </div>

      {/* Chase these */}
      {hottest.length > 0 && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Close these next</p>
          <div className="space-y-1.5">
            {hottest.map((l) => (
              <Link key={l.studentId} href={`/sales/student/${l.studentId}`} className="flex items-center justify-between gap-2 rounded-lg px-1 py-1.5 hover:bg-stone-50">
                <span className="truncate text-sm font-semibold text-stone-800">{l.name}</span>
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold', l.status === 'interested' ? 'bg-amber-50 text-amber-800' : 'bg-sky-50 text-sky-700')}>{l.status === 'interested' ? 'INTERESTED' : 'CALLBACK'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
