import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { getRepPortfolio } from '@/lib/sales-portfolio';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'My leads · CareerRai' };

const FILTERS: { key: string; label: string; match: (s: string) => boolean }[] = [
  { key: 'active', label: 'Active', match: (s) => ['interested', 'follow_up', 'no_answer', 'called'].includes(s) },
  { key: 'interested', label: 'Interested', match: (s) => s === 'interested' },
  { key: 'follow_up', label: 'Callbacks', match: (s) => s === 'follow_up' },
  { key: 'converted', label: 'Won', match: (s) => s === 'converted' },
  { key: 'not_interested', label: 'Lost', match: (s) => s === 'not_interested' },
];
const STATUS_LABEL: Record<string, string> = {
  interested: 'Interested', follow_up: 'Callback', no_answer: 'No answer', called: 'Called', converted: 'Won', not_interested: 'Lost',
};
function istWhen(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '';
}

export default async function MyLeadsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role, email').eq('id', user.id).single();
  if (me?.role !== 'sales' && me?.role !== 'admin') redirect('/login');

  const { leads } = await getRepPortfolio(admin, (me?.email as string) ?? '__none__');
  const filter = f && FILTERS.some((x) => x.key === f) ? f : 'active';
  const flt = FILTERS.find((x) => x.key === filter)!;
  const list = leads.filter((l) => flt.match(l.status));

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>My leads</h1>
        <p className="mt-0.5 text-xs text-stone-500">The students you&apos;re working — your book.</p>
      </div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {FILTERS.map((x) => (
          <Link key={x.key} href={`/sales/leads?f=${x.key}`}
            className={cn('rounded-full border px-3 py-1 text-[11px] font-semibold',
              filter === x.key ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400')}>
            {x.label}
          </Link>
        ))}
      </div>
      {list.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          No leads here yet. Work your calling list on <Link href="/sales" className="font-semibold text-teal-700">Calls</Link> — every student you talk to lands in your book.
        </div>
      ) : (
        <div className="space-y-2">
          {list.map((l) => (
            <Link key={l.studentId} href={`/sales/student/${l.studentId}`} className="block rounded-2xl border border-stone-200 bg-white p-3.5 hover:border-stone-400">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-[15px] font-bold text-stone-900">{l.name}</span>
                <span className={cn('shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold',
                  l.status === 'interested' ? 'bg-amber-50 text-amber-800' : l.status === 'follow_up' ? 'bg-sky-50 text-sky-700' : l.status === 'converted' ? 'bg-emerald-50 text-emerald-700' : l.status === 'not_interested' ? 'bg-stone-100 text-stone-500' : 'bg-stone-100 text-stone-600')}>
                  {STATUS_LABEL[l.status] ?? l.status}
                </span>
              </div>
              <p className="mt-0.5 text-xs text-stone-500">{l.phone ?? 'no phone'}{l.status === 'follow_up' && l.callbackAt ? ` · callback ${istWhen(l.callbackAt)}` : ''}</p>
              {l.note && <p className="mt-1 truncate text-[12px] text-stone-600">{l.note}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
