import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import { WorkspaceShell } from '@/components/admin/workspace-shell';
import { buildTower, renderMetric, type Metric } from '@/lib/sales-control-tower';
import { AssignPanel } from './assign-panel';
import { getTeamCapacity } from '@/lib/sales-capacity';
import { repAllocationLimit, EMPLOYMENT_LABEL, REFUSAL_COPY } from '@/lib/sales-rep-provisioning';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales Control Tower · CareerRai' };

// THE Control Tower. Six layers, and every number carries its evidence class.
//
// The design constraint that shaped this page: with lead_outreach and
// sales_activity both empty, a conventional dashboard would render a grid of
// confident zeros — and "0 calls" would be read as "the team made no calls"
// when the system has no way to observe a call at all. So a zero here is never
// naked. It is either OBSERVED, or SELF-REPORTED, or it says out loud that the
// data was never instrumented.

const EVIDENCE_STYLE: Record<string, string> = {
  observed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  self_reported: 'bg-amber-50 text-amber-800 border-amber-200',
  not_instrumented: 'bg-stone-100 text-stone-500 border-stone-200',
  unavailable: 'bg-rose-50 text-rose-700 border-rose-200',
};
const EVIDENCE_LABEL: Record<string, string> = {
  observed: 'OBSERVED',
  self_reported: 'SELF-REPORTED',
  not_instrumented: 'NOT INSTRUMENTED',
  unavailable: 'READ FAILED',
};

function MetricCard({ m }: { m: Metric }) {
  const big = m.evidence !== 'not_instrumented' && m.value !== null;
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className="text-[11px] font-semibold text-stone-500">{m.label}</div>
      <div className={cn('mt-1 tabular-nums', big ? 'text-2xl font-extrabold text-stone-900' : 'text-[11px] font-bold text-stone-400')}>
        {renderMetric(m)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-1">
        <span className={cn('rounded border px-1.5 py-0.5 text-[9px] font-bold tracking-wide', EVIDENCE_STYLE[m.evidence])}>
          {EVIDENCE_LABEL[m.evidence]}
        </span>
      </div>
      <div className="mt-1 text-[10px] text-stone-400">{m.source}</div>
      {m.hint && m.value ? <div className="mt-1 text-[10px] font-semibold text-stone-600">{m.hint}</div> : null}
    </div>
  );
}

export default async function SalesControlTower() {
  const { user, admin } = await requireAdmin();
  const t = await buildTower(admin);
  // Same authority the distribute route enforces with — the preview and the
  // refusal must be computed from one function, or the founder is shown a
  // split the server will reject.
  const capacity = await getTeamCapacity(admin);
  const capById = new Map(capacity.map((c) => [c.repId, c]));
  const inr = (paise: number) => `Rs ${Math.round(paise / 100).toLocaleString('en-IN')}`;

  return (
    <WorkspaceShell workspaceId="sales" activeHref="/admin/sales/tower"
      title="Sales Control Tower" subtitle="Every number says where it came from and how much it can be trusted.">

      {/* The single most important sentence on the page. */}
      {t.crmInUse === false && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm font-bold text-amber-900">CRM NOT IN USE — no sales activity has ever been recorded</p>
          <p className="mt-1 text-[13px] text-amber-800">
            Every sales number below is zero because nothing has been logged, <strong>not</strong> because the team made
            no calls. This system has no independent way to observe a call — no call id, no duration, no recording — so
            it cannot and will not claim either.
          </p>
        </div>
      )}
      {t.crmInUse === null && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-800">
          NOT AVAILABLE — DATA QUALITY FAILURE. The CRM tables could not be read, so nothing below is trustworthy.
        </div>
      )}

      {/* L1 — TODAY */}
      <h2 className="mt-4 text-[11px] font-bold uppercase tracking-widest text-stone-400">Level 1 · Today</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
        {t.today.map((m) => <MetricCard key={m.label} m={m} />)}
      </div>

      {/* L2 — TEAM */}
      <h2 className="mt-6 text-[11px] font-bold uppercase tracking-widest text-stone-400">Level 2 · Sales team</h2>
      {t.reps === null ? (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          NOT AVAILABLE — DATA QUALITY FAILURE reading the rep rollup.
        </div>
      ) : t.reps.length === 0 ? (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
          No sales or admin accounts exist.
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[720px] text-[12px]">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500">
              <tr>
                <th className="p-2 text-left">Rep</th>
                <th className="p-2 text-left">Employment</th>
                <th className="p-2 text-right">Leads owned</th>
                <th className="p-2 text-right" title="A rep typed this. Not independently confirmed.">Contacted (claimed)</th>
                <th className="p-2 text-right" title="Vendor returned its own call id.">Calls (confirmed)</th>
                <th className="p-2 text-right">Due</th>
                <th className="p-2 text-right">Overdue</th>
                <th className="p-2 text-right">Interested</th>
                <th className="p-2 text-right" title="A paid row in the ledger.">Paid (observed)</th>
                <th className="p-2 text-right">Revenue</th>
                <th className="p-2 text-right">Last activity</th>
              </tr>
            </thead>
            <tbody>
              {t.reps.map((r) => (
                <tr key={r.id} className="border-t border-stone-100">
                  <td className="p-2 font-semibold text-stone-800">{r.name}</td>
                  {/* Shown so the founder can read the row in context — a
                      part-time book is smaller by design, not by underperformance.
                      NOT CONFIGURED is its own state: never silently "full-time". */}
                  <td className="p-2">
                    {r.employmentType ? (
                      <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-bold',
                        r.employmentType === 'part_time' ? 'bg-indigo-50 text-indigo-700' : 'bg-stone-100 text-stone-600')}>
                        {EMPLOYMENT_LABEL[r.employmentType]}
                      </span>
                    ) : (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">NOT CONFIGURED</span>
                    )}
                  </td>
                  <td className="p-2 text-right tabular-nums">{r.leadsOwned}</td>
                  <td className="p-2 text-right tabular-nums text-amber-700">{r.contactedSelfReported}</td>
                  <td className="p-2 text-right tabular-nums text-emerald-700">{r.callsVendorConfirmed}</td>
                  <td className="p-2 text-right tabular-nums">{r.followupsDue}</td>
                  <td className={cn('p-2 text-right tabular-nums', r.followupsOverdue > 0 && 'font-bold text-rose-600')}>{r.followupsOverdue}</td>
                  <td className="p-2 text-right tabular-nums">{r.interested}</td>
                  <td className="p-2 text-right tabular-nums font-semibold text-emerald-700">{r.paidObserved}</td>
                  <td className="p-2 text-right tabular-nums">{r.revenueObservedPaise ? inr(r.revenueObservedPaise) : '—'}</td>
                  <td className="p-2 text-right text-[11px] text-stone-500">
                    {r.lastActivityAt ? new Date(r.lastActivityAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'never'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[11px] text-stone-500">
        <strong>Claimed</strong> and <strong>confirmed</strong> are deliberately separate columns and are never added
        together. A rep typing &ldquo;called&rdquo; is operational information; it is not evidence that a call happened.
      </p>
      {t.conversionRateSuppressed && (
        <p className="mt-1 text-[11px] font-semibold text-stone-600">
          Conversion rate: <span className="text-rose-700">UNAVAILABLE</span> — {t.paidTotal ?? 0} paid customers in
          total. A per-rep percentage on this denominator would be noise with a decimal point.
        </p>
      )}

      {/* L3 — DISTRIBUTION */}
      <h2 className="mt-6 text-[11px] font-bold uppercase tracking-widest text-stone-400">Level 3 · Lead distribution</h2>
      <AssignPanel
        reps={(t.reps ?? []).map((r) => {
          const cap = capById.get(r.id);
          const limit = cap ? repAllocationLimit(cap) : null;
          return {
            id: r.id,
            name: r.name,
            // The headroom the server will enforce, computed by the SAME
            // function the route uses — so the preview cannot promise a split
            // the API is about to refuse.
            headroom: limit?.ok ? limit.max : 0,
            blockedWhy: limit && !limit.ok ? REFUSAL_COPY[limit.reason] : null,
          };
        })}
        unassignedCount={t.unassignedCount}
        staleCount={t.staleCount}
        actorId={user.id}
      />

      {/* L4/L5 — pointers, not duplicates */}
      <h2 className="mt-6 text-[11px] font-bold uppercase tracking-widest text-stone-400">Level 4 &amp; 5 · Student and activity</h2>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <Link href="/admin/leads" className="rounded-xl border border-stone-200 bg-white p-3 hover:border-stone-400">
          <div className="text-sm font-bold text-stone-900">Student 360</div>
          <div className="text-[11px] text-stone-500">Open any lead for their profile, product journey, payments and sales history.</div>
        </Link>
        <Link href="/admin/sales/quality" className="rounded-xl border border-stone-200 bg-white p-3 hover:border-stone-400">
          <div className="text-sm font-bold text-stone-900">Level 6 · Data quality</div>
          <div className="text-[11px] text-stone-500">
            The only layer that was fully renderable before any of this was built — its subject is the missing data.
          </div>
        </Link>
      </div>

      {/* Payment funnel */}
      <h2 className="mt-6 text-[11px] font-bold uppercase tracking-widest text-stone-400">Payment funnel</h2>
      <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {t.pipeline.map((m) => <MetricCard key={m.label} m={m} />)}
      </div>
      <p className="mt-2 text-[11px] text-stone-500">
        Paywall and checkout instrumentation ships with this release. Orders created before it exists have no checkout
        event and never will — that history stays <strong>NOT INSTRUMENTED</strong> rather than being inferred.
      </p>
    </WorkspaceShell>
  );
}
