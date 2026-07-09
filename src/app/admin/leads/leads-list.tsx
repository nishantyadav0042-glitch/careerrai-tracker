'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { TIER_META, type LeadTier } from '@/lib/lead-intel';

export interface LeadRow {
  id: string;
  name: string;
  phone: string | null;
  college: string | null;
  isRepeater: boolean;
  isWorkingProfessional: boolean;
  coachingEnrolled: boolean;
  targetPercentile: number | null;
  tier: LeadTier;
  reasons: string[];
  lastLogDaysAgo: number | null;
  outreachStatus: string;
  outreachOwner: string | null;
  nextFollowUp: string | null;
}

const TIER_STYLE: Record<LeadTier, string> = {
  ready: 'bg-teal-100 text-teal-800',
  high_risk: 'bg-rose-100 text-rose-800',
  dropped_setup: 'bg-amber-100 text-amber-800',
  new: 'bg-blue-100 text-blue-800',
  warming: 'bg-stone-100 text-stone-600',
  inactive: 'bg-stone-100 text-stone-500',
  converted: 'bg-purple-100 text-purple-800',
};

const STATUS_LABEL: Record<string, string> = {
  not_contacted: 'Not contacted',
  called: 'Called',
  interested: 'Interested',
  follow_up: 'Follow-up',
  converted: 'Converted',
  not_interested: 'Not interested',
};

type AttributeFilter = 'repeater' | 'working' | 'coaching' | 'target99' | 'not_contacted';

const ATTRIBUTE_FILTERS: { key: AttributeFilter; label: string }[] = [
  { key: 'repeater', label: 'Repeater' },
  { key: 'working', label: 'Working pro' },
  { key: 'coaching', label: 'In coaching' },
  { key: 'target99', label: 'Target 99+' },
  { key: 'not_contacted', label: 'Never contacted' },
];

// Bucket counters up top (the team opens this, taps a bucket, calls), then
// the filtered list. Tier order is call-priority order, not alphabetical.
export function LeadsList({ rows }: { rows: LeadRow[] }) {
  const [activeTier, setActiveTier] = useState<LeadTier | 'all'>('all');
  const [attrs, setAttrs] = useState<Set<AttributeFilter>>(new Set());

  const tierCounts = useMemo(() => {
    const counts = new Map<LeadTier, number>();
    for (const r of rows) counts.set(r.tier, (counts.get(r.tier) ?? 0) + 1);
    return counts;
  }, [rows]);

  const tiers = (Object.keys(TIER_META) as LeadTier[]).sort((a, b) => TIER_META[a].order - TIER_META[b].order);

  const filtered = useMemo(() => {
    return rows
      .filter((r) => activeTier === 'all' || r.tier === activeTier)
      .filter((r) => {
        if (attrs.has('repeater') && !r.isRepeater) return false;
        if (attrs.has('working') && !r.isWorkingProfessional) return false;
        if (attrs.has('coaching') && !r.coachingEnrolled) return false;
        if (attrs.has('target99') && (r.targetPercentile == null || r.targetPercentile < 99)) return false;
        if (attrs.has('not_contacted') && r.outreachStatus !== 'not_contacted') return false;
        return true;
      })
      .sort((a, b) => TIER_META[a.tier].order - TIER_META[b.tier].order);
  }, [rows, activeTier, attrs]);

  function toggleAttr(key: AttributeFilter) {
    setAttrs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  return (
    <div>
      {/* Bucket counters */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveTier('all')}
          className={cn(
            'rounded-xl border p-3 text-left transition-colors',
            activeTier === 'all' ? 'border-stone-900 bg-white' : 'border-stone-200 bg-white hover:border-stone-300'
          )}
        >
          <p className="text-xl font-bold text-stone-900">{rows.length}</p>
          <p className="text-[11px] font-semibold text-stone-500">All leads</p>
        </button>
        {tiers.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setActiveTier((cur) => (cur === t ? 'all' : t))}
            className={cn(
              'rounded-xl border p-3 text-left transition-colors',
              activeTier === t ? 'border-stone-900 bg-white' : 'border-stone-200 bg-white hover:border-stone-300'
            )}
          >
            <p className="text-xl font-bold text-stone-900">{tierCounts.get(t) ?? 0}</p>
            <p className="text-[11px] font-semibold text-stone-500">{TIER_META[t].label}</p>
          </button>
        ))}
      </div>

      {/* Attribute filters */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {ATTRIBUTE_FILTERS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => toggleAttr(key)}
            className={cn(
              'rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
              attrs.has(key) ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Lead rows */}
      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-stone-200 bg-white p-8 text-center text-sm text-stone-500">
          No leads match these filters.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <Link
              key={r.id}
              href={`/admin/leads/${r.id}`}
              className="block rounded-2xl border border-stone-200 bg-white p-4 transition-colors hover:border-stone-300"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <p className="font-semibold text-stone-900 truncate">{r.name}</p>
                    <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold', TIER_STYLE[r.tier])}>
                      {TIER_META[r.tier].label}
                    </span>
                    {r.isRepeater && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">Repeater</span>}
                    {r.isWorkingProfessional && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">Working</span>}
                    {r.targetPercentile != null && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[10px] font-semibold text-stone-600">Target {r.targetPercentile}</span>}
                  </div>
                  <p className="mt-1 text-xs text-stone-500">{r.reasons[0]}</p>
                  <p className="mt-1 text-[11px] text-stone-400">
                    {r.outreachOwner ? `${r.outreachOwner} · ` : ''}{STATUS_LABEL[r.outreachStatus] ?? r.outreachStatus}
                    {r.nextFollowUp ? ` · follow-up ${r.nextFollowUp}` : ''}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-bold text-orange-600">Open →</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
