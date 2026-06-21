import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IndianRupee, Users, TrendingUp, Calendar } from 'lucide-react';

function nowIST() {
  return new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
}

function currentPeriod() {
  const d = nowIST();
  return d.toLocaleDateString('en-CA').slice(0, 7); // YYYY-MM
}

function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function lastDayOfMonth(year: number, month: number) {
  const d = new Date(year, month + 1, 0);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

function fmt(n: number) {
  return '₹' + Math.round(n).toLocaleString('en-IN');
}

export default async function BuddyEarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  const { data: me } = await admin
    .from('profiles')
    .select('agreed_monthly_payout')
    .eq('id', user.id)
    .single();
  const agreed = (me?.agreed_monthly_payout as number | null) ?? null;

  const { data: studentRows } = await admin
    .from('profiles')
    .select('id, full_name')
    .eq('buddy_id', user.id)
    .eq('role', 'student');
  const students = studentRows ?? [];
  const activeCount = students.length;

  const period = currentPeriod();
  const { data: history } = await admin
    .from('buddy_payouts')
    .select('period, agreed_amount, status, paid_date, payment_ref')
    .eq('buddy_id', user.id)
    .order('period', { ascending: false });
  const rows = history ?? [];
  const thisPeriod = rows.find((r) => r.period === period);
  const periodStatus: 'pending' | 'paid' = (thisPeriod?.status as 'pending' | 'paid') ?? 'pending';

  // Accumulation math (IST)
  const now = nowIST();
  const year = now.getFullYear();
  const month = now.getMonth();
  const dayOfMonth = now.getDate();
  const totalDays = daysInMonth(year, month);
  const payoutDate = lastDayOfMonth(year, month);

  const perDay = agreed ? agreed / totalDays : 0;
  const accrued = Math.round(perDay * dayOfMonth);
  const day1Amt = Math.round(perDay * 1);
  const week1Amt = Math.round(perDay * Math.min(7, totalDays));
  const pctComplete = Math.round((dayOfMonth / totalDays) * 100);
  const perStudentAccrued = activeCount > 0 ? Math.round(accrued / activeCount) : 0;

  return (
    <div className="space-y-5 pb-24">
      <div className="px-1">
        <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold">Earnings</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Your payouts
        </h1>
      </div>

      {agreed == null ? (
        <Card className="p-8 text-center">
          <IndianRupee className="w-6 h-6 text-stone-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-stone-700">Your earnings appear here once your first payout period begins.</p>
          <p className="text-xs text-stone-400 mt-1">Your monthly payout is set by the CareerRai team.</p>
        </Card>
      ) : (
        <>
          {/* Accumulating balance — front and center */}
          <Card className="p-5 bg-gradient-to-br from-stone-900 to-stone-800 border-0">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-teal-400" />
              <p className="text-xs font-semibold uppercase tracking-widest text-teal-400">Earned so far this month</p>
            </div>
            <div className="text-4xl font-bold text-white font-mono mt-2 mb-1">{fmt(accrued)}</div>
            <p className="text-xs text-stone-400">of {fmt(agreed)} monthly · Day {dayOfMonth} of {totalDays}</p>

            {/* Progress bar */}
            <div className="mt-4">
              <div className="w-full bg-stone-700 rounded-full h-2">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-teal-500 to-teal-400 transition-all"
                  style={{ width: `${pctComplete}%` }}
                />
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-[11px] text-stone-400">{pctComplete}% of month complete</span>
                <div className="flex items-center gap-1 text-[11px] text-amber-400 font-semibold">
                  <Calendar className="w-3 h-3" />
                  Pays out {payoutDate}
                </div>
              </div>
            </div>
          </Card>

          {/* The climb: Day 1 → Week 1 → Today */}
          <Card className="p-5">
            <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-4">How your balance has grown</div>
            <div className="flex items-end justify-between gap-2">
              {[
                { label: 'Day 1', amount: day1Amt, height: Math.max(10, Math.round((day1Amt / agreed) * 100)) },
                { label: 'Week 1', amount: week1Amt, height: Math.max(20, Math.round((week1Amt / agreed) * 100)) },
                { label: 'Today', amount: accrued, height: Math.max(30, Math.round((accrued / agreed) * 100)), highlight: true },
              ].map((bar) => (
                <div key={bar.label} className="flex-1 flex flex-col items-center gap-2">
                  <span className={`text-xs font-bold font-mono ${bar.highlight ? 'text-teal-700' : 'text-stone-500'}`}>
                    {fmt(bar.amount)}
                  </span>
                  <div
                    className={`w-full rounded-t-lg ${bar.highlight ? 'bg-gradient-to-t from-teal-600 to-teal-400' : 'bg-stone-200'}`}
                    style={{ height: `${bar.height * 1.2}px`, minHeight: '12px' }}
                  />
                  <span className="text-[10px] text-stone-400 uppercase tracking-wide">{bar.label}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-stone-400 text-center mt-4">
              Staying through the month unlocks your full {fmt(agreed)}.
            </p>
          </Card>

          {/* Per-student accrual */}
          {activeCount > 0 && (
            <div>
              <div className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2 px-1 flex items-center gap-1.5">
                <Users className="w-3 h-3" /> Per student this month
              </div>
              <div className="space-y-2">
                {students.map((s) => (
                  <Card key={s.id} className="p-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-gradient-to-br from-teal-600 to-teal-800 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
                        {((s.full_name ?? '') || 'S').split(' ').map((n: string) => n[0]).filter(Boolean).join('').slice(0, 2).toUpperCase() || '?'}
                      </div>
                      <span className="text-sm font-medium text-stone-900">{s.full_name ?? 'Student'}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-bold font-mono text-teal-700">{fmt(perStudentAccrued)}</div>
                      <div className="text-[10px] text-stone-400">accrued</div>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          )}

          {/* Payout summary */}
          <Card className="p-4 border-teal-200 bg-teal-50">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-teal-600" />
              <span className="text-xs font-semibold text-teal-700 uppercase tracking-wide">This period ({period})</span>
            </div>
            <div className="flex items-center justify-between mt-2">
              <div>
                <div className="text-sm font-semibold text-stone-900">Payout on {payoutDate}</div>
                <div className="text-xs text-stone-500 mt-0.5">{fmt(agreed)} · {activeCount} student{activeCount !== 1 ? 's' : ''}</div>
              </div>
              <Badge color={periodStatus === 'paid' ? 'green' : 'amber'}>
                {periodStatus === 'paid' ? 'Paid' : 'Pending'}
              </Badge>
            </div>
          </Card>

          {/* Payout history */}
          <div>
            <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2 px-1">Payout history</h2>
            {rows.length === 0 ? (
              <Card className="p-6 text-center text-sm text-stone-500">No payouts recorded yet — your first is building now.</Card>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => (
                  <Card key={r.period} className="p-4 flex items-center justify-between">
                    <div>
                      <div className="text-sm font-semibold text-stone-900">{r.period}</div>
                      <div className="text-xs text-stone-500 mt-0.5">
                        {r.status === 'paid' && r.paid_date
                          ? <>Paid {new Date(r.paid_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                          : 'Pending'}
                        {r.status === 'paid' && r.payment_ref && <> · ref {r.payment_ref}</>}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-mono font-semibold text-stone-900">{fmt(r.agreed_amount)}</div>
                      <Badge color={r.status === 'paid' ? 'green' : 'amber'}>{r.status === 'paid' ? 'Paid' : 'Pending'}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-stone-400 text-center px-4">
            Payouts are sent by the CareerRai team via UPI/bank transfer on the last day of each month.
          </p>
        </>
      )}
    </div>
  );
}
