import { requireAdmin } from '@/lib/admin-auth';
import { cn } from '@/lib/utils';
import { WorkspaceShell } from '@/components/admin/workspace-shell';
import { runQualityChecks, renderValue } from '@/lib/sales-data-quality';
import { recentAudit } from '@/lib/sales-audit';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales data quality · CareerRai' };

// Level 6. The only layer of the Control Tower that was fully renderable before
// any of the rest existed, because its subject matter IS the missing data.
//
// Check #11 — "vendor call event attached to a non-student" — returns 236
// against production history. One line of SQL, and it would have caught the
// entire Expedify phone-matching defect on the day it started.

const TONE: Record<string, string> = {
  ok: 'border-stone-200 bg-white',
  attention: 'border-amber-300 bg-amber-50',
  unavailable: 'border-rose-300 bg-rose-50',
  not_instrumented: 'border-stone-200 bg-stone-50',
};
const SEV: Record<string, string> = {
  critical: 'bg-rose-100 text-rose-800',
  warning: 'bg-amber-100 text-amber-800',
  info: 'bg-stone-100 text-stone-600',
};

export default async function SalesQualityPage() {
  const { admin } = await requireAdmin();
  const [checks, audit] = await Promise.all([runQualityChecks(admin), recentAudit(admin, 40)]);
  const needing = checks.filter((c) => c.status === 'attention' || c.status === 'unavailable').length;

  return (
    <WorkspaceShell workspaceId="sales" activeHref="/admin/sales/quality"
      title="Data quality" subtitle="Whether the numbers on every other screen can be trusted.">

      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <p className="text-sm font-bold text-stone-900">
          {needing === 0 ? 'All checks clear.' : `${needing} of ${checks.length} checks need attention.`}
        </p>
        <p className="mt-1 text-[12px] text-stone-600">
          A check that could not run shows <strong>DATA QUALITY FAILURE</strong>, never 0. The difference between
          &ldquo;nothing is wrong&rdquo; and &ldquo;we could not look&rdquo; is the whole point of this page.
        </p>
      </div>

      <div className="mt-3 space-y-2">
        {checks.map((c) => (
          <div key={c.key} className={cn('rounded-xl border p-3', TONE[c.status])}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[13px] font-bold text-stone-900">{c.label}</span>
                  <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', SEV[c.severity])}>{c.severity}</span>
                </div>
                <p className="mt-1 text-[12px] text-stone-600">{c.why}</p>
                <p className="mt-1 text-[10px] font-mono text-stone-400">{c.evidence}</p>
                {(c.status === 'attention' || c.status === 'unavailable') && (
                  <p className="mt-1 text-[11px] font-semibold text-stone-800">→ {c.action}</p>
                )}
              </div>
              <div className={cn('shrink-0 text-right tabular-nums',
                c.value === null ? 'text-[10px] font-bold text-rose-700' : 'text-2xl font-extrabold text-stone-900')}>
                {renderValue(c.value)}
              </div>
            </div>
          </div>
        ))}
      </div>

      <h2 className="mt-6 text-[11px] font-bold uppercase tracking-widest text-stone-400">Audit trail</h2>
      {audit === null ? (
        <div className="mt-2 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-800">
          NOT AVAILABLE — DATA QUALITY FAILURE reading the audit log.
        </div>
      ) : audit.length === 0 ? (
        <div className="mt-2 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-500">
          No privileged actions recorded yet.
        </div>
      ) : (
        <div className="mt-2 overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[560px] text-[12px]">
            <thead className="bg-stone-50 text-[10px] uppercase tracking-wide text-stone-500">
              <tr><th className="p-2 text-left">When</th><th className="p-2 text-left">Actor</th>
                <th className="p-2 text-left">Action</th><th className="p-2 text-left">Target</th></tr>
            </thead>
            <tbody>
              {audit.map((a) => (
                <tr key={String(a.id)} className="border-t border-stone-100">
                  <td className="p-2 text-stone-500">{new Date(a.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}</td>
                  <td className="p-2 font-mono text-[10px] text-stone-500">{a.actorId?.slice(0, 8) ?? '—'}</td>
                  <td className="p-2 font-semibold text-stone-800">{a.action}</td>
                  <td className="p-2 font-mono text-[10px] text-stone-500">{a.targetType}{a.targetId ? ` · ${a.targetId.slice(0, 8)}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WorkspaceShell>
  );
}
