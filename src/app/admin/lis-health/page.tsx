import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { ArrowLeft, Brain, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getLisHealth } from '@/lib/lis-health';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'LIS Health · CareerRai' };

function Bar({ label, count, total, tone }: { label: string; count: number; total: number; tone: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-baseline justify-between text-sm">
        <span className="font-medium text-stone-700">{label}</span>
        <span className="tabular-nums text-stone-500">{count} · {pct}%</span>
      </div>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-100">
        <div className={cn('h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">{label}</p>
      <p className="mt-1 text-2xl font-bold text-stone-900">{value}</p>
      {sub && <p className="mt-0.5 text-[12px] text-stone-500">{sub}</p>}
    </div>
  );
}

const DECISION_TONE: Record<string, string> = {
  analyze_mock: 'bg-violet-500', revise_dont_learn: 'bg-amber-500', take_a_mock: 'bg-teal-500',
  recover: 'bg-rose-500', rebuild_consistency: 'bg-orange-500', push_ahead: 'bg-emerald-500', follow_plan: 'bg-stone-400',
};

export default async function LisHealthPage() {
  const { admin } = await requireAdmin();

  const h = await getLisHealth(admin);
  const n = h.cohortSize;

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/admin/mission-control" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Mission Control
        </Link>
        <div className="mb-4 flex items-start gap-2.5">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-900 text-white"><Brain className="h-5 w-5" /></div>
          <div>
            <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Learning Intelligence — health</h1>
            <p className="mt-0.5 text-xs text-stone-500">
              The engine, running live across {h.cohortSize} of {h.totalStudents} students (those with a log in the last 21 days). Everything below is computed, not stored.
            </p>
          </div>
        </div>

        {n === 0 ? (
          <p className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            No students have logged in the last 21 days — nothing for the engine to reason from yet.
          </p>
        ) : (
          <div className="space-y-4">
            {/* Top-line */}
            <div className="grid grid-cols-3 gap-2">
              <Stat label="Learning Velocity" value={`${h.velocity.avg}`} sub="cohort avg /100" />
              <Stat label="Accelerating" value={h.direction.accelerating} sub={`${h.direction.stalling} losing pace`} />
              <Stat label="Adapted plans" value={h.adaptation.learning} sub={`${h.adaptation.trimmed} trimmed · ${h.adaptation.raised} raised`} />
            </div>

            {/* Velocity distribution */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Learning Velocity distribution</p>
              <Bar label="Strong (65+)" count={h.velocity.strong} total={n} tone="bg-emerald-500" />
              <Bar label="Building (40–64)" count={h.velocity.building} total={n} tone="bg-amber-400" />
              <Bar label="Low (&lt;40)" count={h.velocity.low} total={n} tone="bg-rose-500" />
            </div>

            {/* Decisions — how often the engine makes each call */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
              <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Today&apos;s decision, across the roster</p>
              {h.decisions.filter((d) => d.count > 0).map((d) => (
                <Bar key={d.type} label={d.label} count={d.count} total={n} tone={DECISION_TONE[d.type] ?? 'bg-stone-400'} />
              ))}
              <p className="text-[11px] text-stone-400">A healthy roster is mostly &ldquo;follow the plan&rdquo; — the other calls are the engine catching someone before they slip.</p>
            </div>

            {/* Constraints — the roster's leading bottlenecks */}
            {h.constraints.length > 0 && (
              <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">#1 bottleneck, across the roster</p>
                {h.constraints.map((c) => (
                  <Bar key={c.key} label={c.label} count={c.topCount} total={n} tone="bg-stone-700" />
                ))}
              </div>
            )}

            {/* Confidence + capacity health */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">On-track confidence</p>
                <div className="mt-2 flex gap-1.5 text-sm">
                  <span className="rounded bg-emerald-500 px-2 py-0.5 font-bold text-white">{h.confidence.high} high</span>
                  <span className="rounded bg-amber-500 px-2 py-0.5 font-bold text-white">{h.confidence.medium} med</span>
                  <span className="rounded bg-rose-500 px-2 py-0.5 font-bold text-white">{h.confidence.low} low</span>
                </div>
              </div>
              <div className="rounded-2xl border border-stone-200 bg-white p-4">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Behaviour-capped</p>
                <p className="mt-1 text-2xl font-bold text-stone-900">{h.capacityBehaviourCapped}</p>
                <p className="mt-0.5 text-[12px] text-stone-500">plans sized below what they claimed</p>
              </div>
            </div>

            {/* Interventions — who the engine is steering off the default plan */}
            <div className="rounded-2xl border border-stone-200 bg-white p-4">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">Active interventions · {h.interventions.length}</p>
              <p className="mb-3 text-[12px] text-stone-500">Students the engine is steering off the default plan today — lowest velocity first.</p>
              {h.interventions.length === 0 ? (
                <p className="text-sm text-stone-400">Everyone&apos;s on &ldquo;follow the plan&rdquo; today — nothing to intervene on.</p>
              ) : (
                <div className="space-y-1.5">
                  {h.interventions.map((i) => (
                    <Link key={i.id} href={`/admin/student/${i.id}`}
                      className="flex items-center gap-2 rounded-xl border border-stone-100 bg-stone-50 px-3 py-2 hover:bg-stone-100">
                      <span className={cn('h-2 w-2 shrink-0 rounded-full', DECISION_TONE[i.decision] ?? 'bg-stone-400')} />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-stone-800">{i.name ?? 'Unnamed'}</span>
                      <span className="shrink-0 text-xs font-semibold text-stone-600">{i.decisionLabel}</span>
                      <span className="shrink-0 tabular-nums text-[11px] text-stone-400">LV {i.velocity}</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0 text-stone-300" />
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
