import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { ArrowLeft, Flame } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getRosterMomentum, bandMeta, type MomentumBand } from '@/lib/momentum';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Momentum · CareerRai' };

const BAND_DOT: Record<string, string> = {
  emerald: 'bg-emerald-500', teal: 'bg-teal-500', amber: 'bg-amber-400', orange: 'bg-orange-500', rose: 'bg-rose-500',
};
const VALID: MomentumBand[] = ['champion', 'on_track', 'needs_nudge', 'at_risk', 'rescue'];

export default async function MomentumPage({ searchParams }: { searchParams: Promise<{ band?: string }> }) {
  const { band } = await searchParams;
  const { admin } = await requireAdmin();

  const roster = await getRosterMomentum(admin);
  const filterBand = band && VALID.includes(band as MomentumBand) ? (band as MomentumBand) : null;
  const list = filterBand ? roster.filter((r) => r.band === filterBand) : roster;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/admin/mission-control" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Mission Control
        </Link>
        <div className="mb-3">
          <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            Student momentum{filterBand ? ` · ${bandMeta(filterBand).label}` : ''}
          </h1>
          <p className="mt-0.5 text-xs text-stone-500">{list.length} students · highest momentum first · tap any student for their full 360</p>
        </div>

        {/* Band filter chips */}
        <div className="mb-3 flex flex-wrap gap-1.5">
          <FilterChip href="/admin/momentum" active={!filterBand} label="All" />
          {VALID.map((b) => (
            <FilterChip key={b} href={`/admin/momentum?band=${b}`} active={filterBand === b} label={bandMeta(b).label} color={bandMeta(b).color} />
          ))}
        </div>

        <div className="space-y-2">
          {list.map((r) => {
            const m = bandMeta(r.band);
            return (
              <Link key={r.id} href={`/admin/student/${r.id}`}
                className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 hover:border-stone-400">
                <div className="flex w-10 shrink-0 flex-col items-center">
                  <span className="text-lg font-extrabold text-stone-900 tabular-nums">{r.score}</span>
                  <span className={cn('mt-0.5 h-1.5 w-1.5 rounded-full', BAND_DOT[m.color])} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-bold text-stone-900">{r.full_name ?? 'Student'}</span>
                    {r.isPremium && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-700">PREMIUM</span>}
                    {!r.isPremium && r.hasBuddy && <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[9px] font-bold text-teal-700">BUDDY</span>}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                    <span className={cn('font-semibold', m.color === 'rose' || m.color === 'orange' ? 'text-orange-700' : 'text-stone-600')}>{m.label}</span>
                    <span>·</span>
                    <span>{r.daysSinceLastLog == null ? 'never logged' : r.daysSinceLastLog === 0 ? 'logged today' : `${r.daysSinceLastLog}d since log`}</span>
                    {!r.reachable && <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">unreachable</span>}
                    {r.buddyCtaClicks > 0 && <span className="inline-flex items-center rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-bold text-purple-700"><Flame className="mr-0.5 h-2.5 w-2.5" />{r.buddyCtaClicks} buddy tap{r.buddyCtaClicks === 1 ? '' : 's'}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function FilterChip({ href, active, label, color }: { href: string; active: boolean; label: string; color?: string }) {
  return (
    <Link href={href} className={cn(
      'rounded-full border px-3 py-1 text-[11px] font-semibold',
      active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-200 bg-white text-stone-600 hover:border-stone-400'
    )}>
      {color && !active && <span className={cn('mr-1 inline-block h-2 w-2 rounded-full align-middle', BAND_DOT[color])} />}
      {label}
    </Link>
  );
}
