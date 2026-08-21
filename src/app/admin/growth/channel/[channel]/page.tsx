import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin-auth';
import { AD_CHANNELS, CHANNEL_LABEL, type AdChannel } from '@/lib/attribution';
import { ArrowLeft } from 'lucide-react';

export const dynamic = 'force-dynamic';

// The drill-down behind every number on the Growth page's channel table.
//
// SCALE-CONTRACT: a count the founder cannot open is a number he has to take
// on faith. "Google Ads: 14" is only useful if the next tap shows the fourteen
// people — with their phone numbers, so a lead that arrived this morning can
// be called this morning rather than admired in aggregate.
export default async function ChannelDrilldownPage({
  params,
}: {
  params: Promise<{ channel: string }>;
}) {
  const { channel } = await params;
  if (!(AD_CHANNELS as readonly string[]).includes(channel)) notFound();
  const ch = channel as AdChannel;

  const { admin } = await requireAdmin();

  const { data: rows } = await admin
    .from('profiles')
    .select('id, full_name, phone, created_at, onboarding_completed, subscription_status, attr_source, attr_medium, attr_campaign, attr_click_id')
    .eq('role', 'student')
    .eq('attr_channel', ch)
    .neq('is_test_account', true)
    .order('created_at', { ascending: false })
    .limit(500);

  const students = rows ?? [];

  // Campaign rollup — the actionable cut. Channel tells you Google vs Meta;
  // campaign tells you WHICH ad to keep paying for.
  const byCampaign = new Map<string, { n: number; paid: number }>();
  for (const s of students) {
    const key = s.attr_campaign || '(no campaign tag)';
    const row = byCampaign.get(key) ?? { n: 0, paid: 0 };
    row.n += 1;
    if (s.subscription_status === 'active') row.paid += 1;
    byCampaign.set(key, row);
  }
  const campaigns = [...byCampaign.entries()].sort((a, b) => b[1].n - a[1].n);

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <Link href="/admin/growth" className="inline-flex items-center gap-1.5 text-sm font-medium text-teal-700 hover:underline">
          <ArrowLeft className="w-4 h-4" />Growth &amp; Funnel
        </Link>

        <h1 className="mt-3 text-2xl font-bold text-stone-900 tracking-tight" style={{ fontFamily: 'Georgia, serif' }}>
          {CHANNEL_LABEL[ch]}
        </h1>
        <p className="text-sm text-stone-500 mb-6">
          {students.length} student{students.length === 1 ? '' : 's'}, newest first.
          {ch === 'meta_link' && ' These carried an fbclid but no paid tag — they may be organic Meta traffic, not ad spend.'}
        </p>

        {campaigns.length > 1 && (
          <div className="rounded-2xl border border-stone-200 bg-white p-5 mb-6">
            <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">By campaign</p>
            <div className="space-y-1.5">
              {campaigns.map(([name, r]) => (
                <div key={name} className="grid grid-cols-[1fr_auto_auto] gap-3 text-sm px-1 py-1 border-t border-stone-100">
                  <span className="text-stone-800 truncate">{name}</span>
                  <span className="text-right tabular-nums text-stone-900 font-semibold">{r.n}</span>
                  <span className="text-right tabular-nums text-stone-500">{r.paid} paid</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="rounded-2xl border border-stone-200 bg-white p-5">
          <p className="text-xs uppercase tracking-widest text-stone-500 font-semibold mb-3">The students</p>
          <div className="space-y-1">
            {students.map((s) => (
              <Link
                key={s.id}
                href={`/admin/student/${s.id}`}
                className="block px-1 py-2 border-t border-stone-100 hover:bg-stone-50"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-semibold text-stone-900 truncate">{s.full_name || 'Student'}</span>
                  <span className="text-[11px] text-stone-400 tabular-nums shrink-0">
                    {new Date(s.created_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })}
                  </span>
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11.5px] text-stone-500">
                  {s.phone && <span className="tabular-nums">{s.phone}</span>}
                  {s.attr_campaign && <span className="rounded bg-stone-100 px-1.5 py-0.5">{s.attr_campaign}</span>}
                  {s.attr_source && <span>{s.attr_source}{s.attr_medium ? ` / ${s.attr_medium}` : ''}</span>}
                  {s.subscription_status === 'active'
                    ? <span className="font-semibold text-emerald-700">paid</span>
                    : s.onboarding_completed
                      ? <span className="text-stone-400">onboarded</span>
                      : <span className="text-amber-700">never onboarded</span>}
                </div>
              </Link>
            ))}
            {students.length === 0 && (
              <p className="text-sm text-stone-400 py-2">
                No students from this channel yet.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
