import Link from 'next/link';
import { requireSales } from '@/lib/admin-auth';
import { getRepPayslip, istMonthOf, rs, planLabel, type Payslip } from '@/lib/sales-earnings';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sales — My earnings · CareerRai' };

// ── The statement the engagement letter promises ────────────────────────────
//
// Clause 6 of both letters: "a statement of your conversions shall be
// furnished to you on request; any discrepancy shall be reconciled against
// those records." A statement that only exists when the founder is asked for
// it, and only as a SQL query he runs himself, is a promise with a person in
// the middle of it. This is that clause as a screen the counsellor opens.
//
// It is deliberately the FULL working, not a total. Every conversion is a row
// with the student's name, the plan, what they paid and what it earned —
// because the number a person is paid is the one number they are entitled to
// check line by line, and a single bold figure invites exactly the argument
// this page exists to prevent.

function ist(d: string) {
  return new Date(d).toLocaleDateString('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short',
  });
}

/** Previous IST months, newest first, for the picker. */
function recentMonths(count = 6): string[] {
  const out: string[] = [];
  const now = new Date();
  for (let i = 0; i < count; i++) {
    out.push(istMonthOf(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 15))));
  }
  return [...new Set(out)];
}

function monthLabel(m: string) {
  const [y, mo] = m.split('-').map(Number);
  return new Date(Date.UTC(y, mo - 1, 15)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function Slip({ slip }: { slip: Payslip }) {
  const stated = slip.terms.stated;
  return (
    <>
      <div className="rounded-2xl border border-teal-700 bg-teal-700 p-5 text-white">
        <p className="text-[11px] font-bold uppercase tracking-widest text-teal-200">
          {monthLabel(slip.month)} · so far
        </p>
        {stated ? (
          <>
            <h1 className="mt-1 text-3xl font-extrabold tabular-nums">{rs(slip.totalPaise)}</h1>
            <p className="mt-1 text-sm text-teal-100">
              {rs(slip.fixedPaise)} fixed + {rs(slip.incentivePaise)} from{' '}
              {slip.conversionsCounted} conversion{slip.conversionsCounted === 1 ? '' : 's'}
            </p>
          </>
        ) : (
          // Law L1 on the screen. Never a confident ₹0 for someone whose terms
          // simply have not been entered yet — that is a number they might
          // believe, and it is not true.
          <>
            <h1 className="mt-1 text-2xl font-bold">Your terms aren’t set up yet</h1>
            <p className="mt-1 text-sm text-teal-100">
              Your conversions are being recorded below and nothing is lost. The
              fixed fee and rate still have to be entered, so we’re not showing
              you a total we can’t stand behind. Ask Nishant to set them.
            </p>
          </>
        )}
        <p className="mt-3 rounded-xl bg-white/10 px-3 py-2 text-[12px] text-teal-100">
          Paid together, by the 7th of next month. A conversion counts once the
          student’s payment reaches us and isn’t refunded.
        </p>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { l: 'Conversions', v: String(slip.conversionsCounted) },
          { l: 'Students paid', v: rs(slip.netRealisedPaise) },
          { l: 'Refunded', v: slip.conversionsRefunded > 0 ? String(slip.conversionsRefunded) : '0' },
        ].map((x) => (
          <div key={x.l} className="rounded-xl border border-stone-200 bg-white p-3">
            <div className="text-lg font-extrabold tabular-nums text-stone-900">{x.v}</div>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">{x.l}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">
          Every conversion this month
        </p>
        {slip.lines.length === 0 ? (
          <p className="text-sm text-stone-400">
            No conversions yet this month. Your fixed fee is unaffected.
          </p>
        ) : (
          <div className="divide-y divide-stone-100">
            {slip.lines.map((l) => (
              <div key={l.paymentId} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="truncate text-[13px] font-semibold text-stone-800">
                    {l.studentName ?? 'Student'}
                  </p>
                  <p className="text-[11px] text-stone-500">
                    {planLabel(l.plan)} · {rs(l.amountPaise)} · {ist(l.realisedAt)}
                  </p>
                  {l.refundedAt && (
                    // Shown rather than hidden: a sale the counsellor remembers
                    // making, missing from their statement with no explanation,
                    // costs more trust than the deduction does.
                    <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
                      Refunded {ist(l.refundedAt)} — this one doesn’t count
                    </p>
                  )}
                </div>
                <span className={`shrink-0 font-mono text-[13px] font-bold tabular-nums ${
                  l.refundedAt ? 'text-stone-300 line-through' : 'text-stone-900'}`}>
                  {l.incentivePaise == null ? '—' : rs(l.incentivePaise)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <p className="mt-3 px-1 text-[11px] leading-relaxed text-stone-400">
        These are the records your statement is reconciled against. If your count
        and this page disagree, this page isn’t automatically right — tell
        Nishant and he’ll show you the underlying records.
      </p>
    </>
  );
}

export default async function SalesEarningsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { user, admin } = await requireSales();
  const { m } = await searchParams;
  const months = recentMonths();
  const month = m && /^\d{4}-\d{2}$/.test(m) ? m : months[0];

  let slip: Payslip | null = null;
  let readFailed = false;
  try {
    // A rep can only ever read their OWN payslip: the id comes from the
    // session, never from the query string. There is no rep parameter here by
    // design — one counsellor's pay is not the other's business.
    slip = await getRepPayslip(admin, user.id, month);
  } catch (e) {
    // Never render a failed read as "you earned nothing". Same rule as the
    // call queue: an error the person can retry, not a confident zero.
    console.error('[sales/earnings] payslip read failed:', e);
    readFailed = true;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {months.map((mm) => (
          <Link key={mm} href={`/sales/earnings?m=${mm}`}
            className={`rounded-full px-3 py-1 text-[12px] font-bold ${
              mm === month ? 'bg-stone-900 text-white' : 'border border-stone-300 bg-white text-stone-700'}`}>
            {monthLabel(mm).replace(' 20', ' ’')}
          </Link>
        ))}
      </div>

      {readFailed || !slip ? (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5">
          <p className="text-sm font-bold text-amber-900">We couldn’t load your earnings just now.</p>
          <p className="mt-1 text-[13px] text-amber-800">
            This is a problem on our side, not a zero. Nothing you’ve earned is
            affected. Refresh in a moment, and tell Nishant if it keeps happening.
          </p>
        </div>
      ) : (
        <Slip slip={slip} />
      )}
    </div>
  );
}
