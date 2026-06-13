import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { IndianRupee, Users } from 'lucide-react';

function currentPeriod() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }).slice(0, 7);
}

export default async function BuddyEarningsPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const admin = createAdminClient();
  // Buddy reads ONLY their own numbers, and only the amount the founder set.
  const { data: me } = await admin
    .from('profiles')
    .select('agreed_monthly_payout')
    .eq('id', user.id)
    .single();
  const agreed = (me?.agreed_monthly_payout as number | null) ?? null;

  const { count: activeStudents } = await admin
    .from('profiles')
    .select('id', { count: 'exact', head: true })
    .eq('buddy_id', user.id)
    .eq('role', 'student');

  const period = currentPeriod();
  const { data: history } = await admin
    .from('buddy_payouts')
    .select('period, agreed_amount, status, paid_date, payment_ref')
    .eq('buddy_id', user.id)
    .order('period', { ascending: false });
  const rows = history ?? [];
  const thisPeriod = rows.find((r) => r.period === period);
  const periodStatus: 'pending' | 'paid' = (thisPeriod?.status as 'pending' | 'paid') ?? 'pending';

  return (
    <div className="space-y-5">
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
          <Card className="p-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">Monthly payout</div>
                <div className="text-2xl font-bold text-stone-900 font-mono mt-1">₹{agreed.toLocaleString('en-IN')}</div>
              </div>
              <div>
                <div className="text-xs text-stone-500 font-medium uppercase tracking-wide flex items-center gap-1">
                  <Users className="w-3 h-3" /> Active students
                </div>
                <div className="text-2xl font-bold text-stone-900 font-mono mt-1">{activeStudents ?? 0}</div>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-stone-100 flex items-center justify-between">
              <span className="text-sm text-stone-600">This period ({period})</span>
              <Badge color={periodStatus === 'paid' ? 'green' : 'amber'}>{periodStatus === 'paid' ? 'Paid' : 'Pending'}</Badge>
            </div>
          </Card>

          <div>
            <h2 className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-2 px-1">Payout history</h2>
            {rows.length === 0 ? (
              <Card className="p-6 text-center text-sm text-stone-500">No payouts recorded yet.</Card>
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
                      <div className="text-sm font-mono font-semibold text-stone-900">₹{r.agreed_amount.toLocaleString('en-IN')}</div>
                      <Badge color={r.status === 'paid' ? 'green' : 'amber'}>{r.status === 'paid' ? 'Paid' : 'Pending'}</Badge>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          <p className="text-[11px] text-stone-400 text-center px-4">
            Payouts are sent manually by the CareerRai team via UPI/bank transfer and recorded here.
          </p>
        </>
      )}
    </div>
  );
}
