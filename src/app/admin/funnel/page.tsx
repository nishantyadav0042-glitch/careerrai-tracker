import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell, AdminEmpty } from '@/components/admin/workspace-shell';
import { assembleActivationFunnel } from '@/lib/os/activation-funnel';

export const dynamic = 'force-dynamic';

// THE FOUNDER FUNNEL — where the 212 disappear.
//
// One activation funnel, not a dashboard: signup → onboarding → Blueprint →
// first tick → first log → day-2 return → week-2 retention. Every bar is
// clickable and opens the EXACT students who leaked at that step (reached the
// previous stage, never this one) — name, WhatsApp, student 360. Segmentable
// self-prep vs coaching, with signup-week cohorts underneath so a front-door
// change shows up as a cohort difference, not an argument.
const SEGS = [
  { v: 'all', label: 'Everyone' },
  { v: 'self', label: 'Self-prep' },
  { v: 'coaching', label: 'Coaching' },
] as const;

export default async function FunnelPage({ searchParams }: { searchParams: Promise<{ seg?: string; leak?: string }> }) {
  const { admin } = await requireAdmin();
  const { seg: rawSeg, leak: rawLeak } = await searchParams;
  const seg = (['all', 'self', 'coaching'] as const).find((s) => s === rawSeg) ?? 'all';
  const funnel = await assembleActivationFunnel(admin, seg);

  const total = funnel.stages[0]?.members.length ?? 0;
  const leakStage = funnel.stages.find((s) => s.key === rawLeak) ?? null;
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const qs = (extra: string) => `/admin/funnel?seg=${seg}${extra}`;

  return (
    <WorkspaceShell
      workspaceId="analytics"
      activeHref="/admin/funnel"
      title="Activation funnel"
      subtitle={`${total} students · every number opens the exact people behind it`}
    >
      {/* Segment chips */}
      <div className="mb-4 flex gap-1.5">
        {SEGS.map((s) => (
          <Link key={s.v} href={`/admin/funnel?seg=${s.v}`}
            className={s.v === seg
              ? 'rounded-lg bg-stone-900 px-2.5 py-1 text-[11.5px] font-semibold text-white'
              : 'rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11.5px] font-semibold text-stone-600 hover:border-stone-400'}>
            {s.label}
          </Link>
        ))}
      </div>

      {/* The funnel — each stage bar + its leak, both clickable */}
      <div className="space-y-1.5">
        {funnel.stages.map((s, i) => (
          <div key={s.key} className="rounded-2xl border border-stone-200 bg-white p-3">
            <div className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-[12.5px] font-semibold text-stone-800">{s.label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-md bg-stone-100">
                <div className="h-full rounded-md bg-teal-700" style={{ width: `${Math.max(1, pct(s.members.length))}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right font-mono text-[13px] font-bold text-stone-900">
                {s.members.length}<span className="ml-1 text-[10.5px] font-semibold text-stone-400">{pct(s.members.length)}%</span>
              </span>
            </div>
            {i > 0 && s.leak.length > 0 && (
              <div className="mt-1.5 pl-44">
                <Link href={qs(`&leak=${s.key}`)} className="text-[11.5px] font-semibold text-orange-700 underline decoration-orange-300 hover:decoration-orange-700">
                  −{s.leak.length} lost here → see exactly who
                </Link>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* The leak drill-down — the law: every count opens its exact people */}
      {leakStage && (
        <div className="mt-5 rounded-2xl border border-orange-300 bg-orange-50 p-4">
          <div className="flex items-baseline justify-between gap-2">
            <p className="text-[13.5px] font-bold text-stone-900">
              Lost before “{leakStage.label}” — {leakStage.leak.length} student{leakStage.leak.length === 1 ? '' : 's'}
            </p>
            <Link href={qs('')} className="text-[11px] font-semibold text-stone-500 underline">close</Link>
          </div>
          {leakStage.leak.length === 0 ? (
            <AdminEmpty>No one leaks at this step.</AdminEmpty>
          ) : (
            <div className="mt-2.5 space-y-1">
              {leakStage.leak
                .slice()
                .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
                .map((s) => (
                  <div key={s.id} className="flex items-center gap-2 rounded-xl bg-white px-3 py-2">
                    <Link href={`/admin/student/${s.id}`} className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-900 hover:underline">
                      {s.name}
                    </Link>
                    <span className="shrink-0 text-[10.5px] text-stone-400">joined {s.createdAt.slice(0, 10)}</span>
                    {s.phone && (
                      <a href={`https://wa.me/${s.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer"
                        className="shrink-0 text-[11px] font-bold text-teal-700">WA</a>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      )}

      {/* Cohorts — a front-door change must show up here, not in an argument */}
      <div className="mt-6 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Signup-week cohorts</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[10.5px] uppercase tracking-wider text-stone-400">
                <th className="py-1.5 pr-3">Week of</th>
                <th className="py-1.5 pr-3 text-right">Signups</th>
                <th className="py-1.5 pr-3 text-right">Onboarded</th>
                <th className="py-1.5 pr-3 text-right">Ticked</th>
                <th className="py-1.5 pr-3 text-right">Logged</th>
                <th className="py-1.5 text-right">Returned d2</th>
              </tr>
            </thead>
            <tbody>
              {funnel.cohorts.map((c) => (
                <tr key={c.week} className="border-t border-stone-100 font-mono tabular-nums text-stone-800">
                  <td className="py-1.5 pr-3 font-sans font-semibold">{c.week}</td>
                  <td className="py-1.5 pr-3 text-right">{c.total}</td>
                  <td className="py-1.5 pr-3 text-right">{c.onboarded}</td>
                  <td className="py-1.5 pr-3 text-right">{c.ticked}</td>
                  <td className="py-1.5 pr-3 text-right">{c.logged}</td>
                  <td className="py-1.5 text-right">{c.returned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </WorkspaceShell>
  );
}
