import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { WorkspaceShell } from '@/components/admin/workspace-shell';
import { getTeamPayslips, istMonthOf, rs, planLabel } from '@/lib/sales-earnings';
import { getRepFollowupBoard } from '@/lib/sales-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Payroll · CareerRai' };

// ── What the founder owes, and the exact rows behind it ─────────────────────
//
// Two engagement letters were signed on 28 Aug 2026 promising ₹8,000 + 10% of
// what each converted student pays, settled by the 7th of the following month.
// This is the screen that gets paid from, and it is built to the Scale
// Contract's rule: every count drills down to the records behind it, on the
// same page, from the same query. There is no summary number here that a
// detail view could contradict, because there is no separate detail view.
//
// It reports UNKNOWN loudly. A counsellor whose terms have not been entered
// shows as "terms not set" rather than as ₹0 — the founder must never be able
// to pay a confident zero that was really a missing config row.

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function recentMonths(count = 6) {
  const now = new Date();
  return [...new Set(Array.from({ length: count }, (_, i) =>
    istMonthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15)))))];
}

function ist(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
}

export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { admin } = await requireAdmin();
  const { m } = await searchParams;
  const months = recentMonths();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : months[0];

  const slips = await getTeamPayslips(admin, month);
  // Follow-up health beside the money, deliberately. The letters put retention
  // first and conversion second; a payroll screen that shows only what was
  // sold would quietly invert that on the one page the founder reads monthly.
  const boards = await Promise.all(slips.map((s) => getRepFollowupBoard(admin, s.repId)));

  // A SUM of authority-computed totals, not a second calculation. Each
  // s.totalPaise came out of computePayslip(); this page never applies a rate,
  // never touches amount_paise, and never decides what a refund does. A rep
  // whose terms are unstated contributes null → 0 here and is called out in the
  // caption, so the total can never quietly include a payslip we cannot stand
  // behind. sales-earnings.guard.test.ts fails the build if this page ever
  // starts computing instead of summing.
  const payableTotal = slips.reduce((a, s) => a + (s.totalPaise ?? 0), 0);
  const anyUnstated = slips.some((s) => !s.terms.stated);

  return (
    <WorkspaceShell
      workspaceId="sales"
      activeHref="/admin/sales/payroll"
      title={`Payroll — ${monthLabel(month)}`}
      subtitle="What each counsellor is owed, and every conversion behind it. Paid by the 7th of next month."
    >
      <div className="mb-3 flex flex-wrap gap-1.5">
        {months.map((mm) => (
          <Link key={mm} href={`/admin/sales/payroll?m=${mm}`}
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${
              mm === month ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
            {monthLabel(mm).replace(' 20', ' ’')}
          </Link>
        ))}
      </div>

      <div className="rounded-2xl border border-stone-900 bg-stone-900 p-4 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Total payable</p>
        <p className="mt-1 text-3xl font-extrabold tabular-nums">{rs(payableTotal)}</p>
        <p className="mt-1 text-[12px] text-stone-400">
          {slips.length} {slips.length === 1 ? 'person' : 'people'}
          {anyUnstated && ' · some terms not set — those are excluded from this total'}
        </p>
      </div>

      {slips.length === 0 && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-500">
            Nobody has stated terms or recorded a conversion this month.
          </p>
        </div>
      )}

      <div className="mt-3 space-y-3">
        {slips.map((s, i) => {
          const b = boards[i];
          const breached = b.awaitingFirstContact.filter(
            (l) => l.sla.state === 'awaiting' && l.sla.breached).length;
          return (
            <div key={s.repId} className="rounded-2xl border border-stone-200 bg-white p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[15px] font-bold text-stone-900">{s.repName}</p>
                  {s.terms.stated ? (
                    <p className="text-[12px] text-stone-500">
                      {rs(s.terms.fixedPaise)}/month + {s.terms.incentivePercent}% per conversion
                    </p>
                  ) : (
                    <p className="text-[12px] font-semibold text-amber-700">
                      Terms not set — {s.terms.missing.join(' and ')} missing
                    </p>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-2xl font-extrabold tabular-nums text-stone-900">
                    {s.totalPaise == null ? '—' : rs(s.totalPaise)}
                  </p>
                  {s.terms.stated && (
                    <p className="text-[11px] text-stone-500">
                      {rs(s.fixedPaise)} + {rs(s.incentivePaise)}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { l: 'Conversions', v: String(s.conversionsCounted) },
                  { l: 'Students paid', v: rs(s.netRealisedPaise) },
                  { l: 'Promises overdue', v: b.promises == null ? '?' : String(b.overdue.length),
                    bad: (b.overdue.length > 0) },
                  { l: 'Uncalled past SLA', v: b.slaMinutes == null ? '—' : String(breached), bad: breached > 0 },
                ].map((x) => (
                  <div key={x.l} className={`rounded-xl border p-2.5 ${
                    x.bad ? 'border-rose-200 bg-rose-50' : 'border-stone-200 bg-stone-50'}`}>
                    <div className={`text-lg font-extrabold tabular-nums ${x.bad ? 'text-rose-700' : 'text-stone-900'}`}>{x.v}</div>
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{x.l}</div>
                  </div>
                ))}
              </div>

              {s.lines.length > 0 && (
                <div className="mt-3 border-t border-stone-100 pt-2">
                  <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                    Every conversion behind that number
                  </p>
                  <div className="divide-y divide-stone-100">
                    {s.lines.map((l) => (
                      <Link key={l.paymentId} href={`/admin/student/${l.studentId}`}
                        className="flex items-center justify-between gap-3 rounded px-1 py-1.5 hover:bg-stone-50">
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-semibold text-stone-800">
                            {l.studentName ?? 'Student'}
                          </p>
                          <p className="text-[11px] text-stone-500">
                            {planLabel(l.plan)} · {rs(l.amountPaise)} · {ist(l.realisedAt)}
                            {l.refundedAt && ` · refunded ${ist(l.refundedAt)}`}
                          </p>
                        </div>
                        <span className={`shrink-0 font-mono text-[13px] font-bold tabular-nums ${
                          l.refundedAt ? 'text-stone-300 line-through' : 'text-stone-900'}`}>
                          {l.incentivePaise == null ? '—' : rs(l.incentivePaise)}
                        </span>
                      </Link>
                    ))}
                  </div>
                  {s.conversionsRefunded > 0 && (
                    <p className="mt-1 text-[11px] text-amber-700">
                      {s.conversionsRefunded} refunded — {rs(s.refundedPaise)} taken out of this month.
                      Only that transaction’s incentive is withdrawn.
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </WorkspaceShell>
  );
}
