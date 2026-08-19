import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import {
  BUDDY_FUNNEL_STEPS, MIN_FOR_RATE, ratesAreMeaningful, rateOrNull,
  type FunnelStepCount,
} from '@/lib/os/buddy-funnel';

export const dynamic = 'force-dynamic';

// The IIM Buddy funnel — the founder's P1, answered from events that were
// already recording. Read-only. No new instrumentation, no new tables.
//
// The one design rule that matters here: this page refuses to print a
// conversion rate until the base can carry one. The offer went live on 17 Aug
// with no promotion; "0% conversion" over three clicks reads as a finding and
// is not one. Counts always, ratios only past MIN_FOR_RATE, and an explicit
// sentence when it is too early.

export default async function BuddyFunnelPage() {
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const keys = BUDDY_FUNNEL_STEPS.map((s) => s.key);

  const [{ data: events }, { data: payments }] = await Promise.all([
    admin.from('student_events')
      .select('event, user_id, anon_id, created_at, props')
      .in('event', keys as unknown as string[]),
    admin.from('student_payments').select('plan, status, amount, created_at'),
  ]);

  const steps: FunnelStepCount[] = BUDDY_FUNNEL_STEPS.map((s) => {
    const rows = (events ?? []).filter((e) => e.event === s.key);
    const people = new Set(rows.map((r) => (r.user_id as string) ?? (r.anon_id as string))).size;
    const times = rows.map((r) => r.created_at as string).sort();
    return {
      key: s.key, label: s.label, note: s.note,
      events: rows.length, people,
      firstSeen: times[0] ?? null,
      lastSeen: times[times.length - 1] ?? null,
    };
  });

  // Which finding produced the click. book-session-card stamps `finding` on
  // session_book_click, so this is the founder's "which trigger produced the
  // highest intent" — already recorded, never surfaced.
  const byTrigger = new Map<string, number>();
  for (const e of (events ?? []).filter((x) => x.event === 'session_book_click')) {
    const t = ((e.props as Record<string, unknown> | null)?.finding as string) ?? 'no finding recorded';
    byTrigger.set(t, (byTrigger.get(t) ?? 0) + 1);
  }

  const paid = (payments ?? []).filter((p) => p.status === 'paid');
  const paidSessions = paid.filter((p) => p.plan === 'session').length;
  const entry = steps.find((s) => s.key === 'session_book_click');
  const showRates = ratesAreMeaningful(steps);

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Link href="/admin" className="text-xs text-stone-500 hover:underline">← Admin</Link>
      <h1 className="mt-2 text-2xl font-bold text-stone-900">IIM Buddy funnel</h1>
      <p className="mt-1 text-sm text-stone-600">
        Shown → opened → clicked → checkout → paid. Every number below is a distinct-person
        count from events that were already recording.
      </p>

      {!showRates && (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3">
          <p className="text-[13px] font-semibold text-amber-900">Too early for conversion rates.</p>
          <p className="mt-0.5 text-[12px] leading-snug text-amber-800">
            The ₹299 offer went live on 17 Aug with no promotion behind it. Fewer than {MIN_FOR_RATE} people
            have reached the entry step, so a percentage here would read as a finding without being one.
            Counts are shown; rates appear on their own once the base can carry them.
          </p>
        </div>
      )}

      <div className="mt-5 overflow-x-auto">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-left text-[11px] uppercase tracking-wider text-stone-400">
              <th className="py-2 pr-3">Step</th>
              <th className="py-2 pr-3 text-right">People</th>
              <th className="py-2 pr-3 text-right">Events</th>
              {showRates && <th className="py-2 pr-3 text-right">% of clicks</th>}
              <th className="py-2">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {steps.map((s) => {
              const pct = showRates ? rateOrNull(s.people, entry?.people ?? 0) : null;
              return (
                <tr key={s.key} className="border-b border-stone-100 align-top">
                  <td className="py-2.5 pr-3">
                    <div className="font-semibold text-stone-900">{s.label}</div>
                    {s.note && <div className="text-[11px] text-stone-500">{s.note}</div>}
                  </td>
                  <td className="py-2.5 pr-3 text-right font-bold tabular-nums text-stone-900">{s.people}</td>
                  <td className="py-2.5 pr-3 text-right tabular-nums text-stone-500">{s.events}</td>
                  {showRates && (
                    <td className="py-2.5 pr-3 text-right tabular-nums text-stone-600">{pct == null ? '—' : `${pct}%`}</td>
                  )}
                  <td className="py-2.5 text-[11px] text-stone-500">
                    {s.lastSeen ? new Date(s.lastSeen).toISOString().slice(0, 16).replace('T', ' ') : '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* WHICH FINDING PRODUCED THE CLICK. */}
      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          ₹299 clicks by trigger
        </p>
        {byTrigger.size === 0 ? (
          <p className="mt-2 text-[13px] text-stone-500">No ₹299 clicks recorded yet.</p>
        ) : (
          <ul className="mt-2 space-y-1">
            {[...byTrigger.entries()].sort((a, b) => b[1] - a[1]).map(([t, n]) => (
              <li key={t} className="flex items-baseline justify-between gap-3 text-sm">
                <span className="font-mono text-[12px] text-stone-700">{t}</span>
                <span className="font-bold tabular-nums text-stone-900">{n}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] leading-snug text-stone-500">
          Only the session card carries a finding. The daily buddy nudge counted above is
          <strong> not an intervention</strong> — it fires once a day for any student without a
          buddy, regardless of what their preparation looks like, so its shown/clicked numbers
          say nothing about which diagnosis moves a student.
        </p>
      </div>

      {/* Money comes from the ledger, never from client events. The client
          callbacks are known to miss real payments (Aug audit), so a funnel
          that counted pay_success would under-report revenue. */}
      <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          From the payment ledger
        </p>
        <div className="mt-2 grid grid-cols-3 gap-3">
          <div>
            <p className="text-2xl font-bold tabular-nums text-stone-900">{paidSessions}</p>
            <p className="text-[11px] text-stone-500">₹299 sessions paid</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-stone-900">{paid.length}</p>
            <p className="text-[11px] text-stone-500">All plans paid</p>
          </div>
          <div>
            <p className="text-2xl font-bold tabular-nums text-stone-900">{(payments ?? []).length}</p>
            <p className="text-[11px] text-stone-500">Orders created</p>
          </div>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-stone-500">
          Orders created minus paid is where students stop. We do not record a reason —
          nobody asked them — so this page does not claim one.
        </p>
      </div>
    </div>
  );
}
