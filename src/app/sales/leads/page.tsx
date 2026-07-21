import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { cn } from '@/lib/utils';
import { getLeadsBoard } from '@/lib/sales-queue';
import { SalesWorkspace } from '@/components/sales-workspace';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — All leads · CareerRai' };

const FILTERS: { key: string; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'hot', label: 'Hot' },
  { key: 'new', label: 'Not contacted' },
  { key: 'interested', label: 'Interested' },
  { key: 'follow_up', label: 'Follow-up' },
];

export default async function SalesLeadsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const { f } = await searchParams;
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();

  const board = await getLeadsBoard(admin);
  const filter = f && FILTERS.some((x) => x.key === f) ? f : 'all';
  const list = board.filter((r) => {
    if (filter === 'all') return true;
    if (filter === 'hot') return r.tier === 'hot';
    if (filter === 'new') return !r.status || r.status === 'not_contacted';
    return r.status === filter;
  });

  return (
    <div>
      <div className="mb-3">
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>All leads</h1>
        <p className="mt-0.5 text-xs text-stone-500">{list.length} of {board.length} free students · priority-ranked · your CRM, always live.</p>
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
      <SalesWorkspace cards={list} />
    </div>
  );
}
