import Link from 'next/link';
import { requireSales } from '@/lib/admin-auth';
import { ArrowLeft, Phone, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getSalesConversionView } from '@/lib/sales-conversion';
import { QuickLog } from '@/components/sales-log';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Convert · CareerRai' };

const TIER: Record<string, string> = {
  hot: 'bg-rose-50 text-rose-700 border-rose-200', warm: 'bg-amber-50 text-amber-800 border-amber-200', cool: 'bg-stone-100 text-stone-500 border-stone-200',
};

export default async function ConvertPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, admin } = await requireSales();
  const { data: me } = await admin.from('profiles').select('role, email').eq('id', user.id).single();

  const v = await getSalesConversionView(admin, id);
  if (!v) return <div className="p-8 text-center text-sm text-stone-500">Student not found. <Link href="/sales" className="underline">Back</Link></div>;

  return (
    <div className="pb-10">
      <Link href="/sales" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
        <ArrowLeft className="h-3.5 w-3.5" /> Calling list
      </Link>

      {/* Who + score + call actions */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="truncate text-xl font-bold text-stone-900">{v.name}</h1>
            <p className="text-xs text-stone-500">{v.phone ?? 'no phone'} · {v.lastActivity}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
              <span className="font-mono text-base font-extrabold text-stone-900">{v.convScore}</span>
              <span className={cn('rounded-full border px-2 py-0.5', TIER[v.tier])}>{v.tier.toUpperCase()}</span>
              <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">momentum {v.momentumScore} · {v.momentumLabel}</span>
              {v.status && v.status !== 'not_contacted' && <span className="rounded-full bg-teal-50 px-2 py-0.5 text-teal-700">{v.status}</span>}
            </div>
          </div>
          <div className="flex shrink-0 flex-col gap-1.5">
            {v.waNumber && <a href={`https://wa.me/${v.waNumber}?text=${encodeURIComponent(v.pitch)}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-1 rounded-xl bg-[#25d366] px-3 py-2 text-[12px] font-bold text-[#04331c]">WhatsApp</a>}
            {v.phone && <a href={`tel:${v.phone}`} className="inline-flex items-center justify-center gap-1 rounded-xl bg-stone-900 px-3 py-2 text-[12px] font-bold text-white"><Phone className="h-3.5 w-3.5" /> Call</a>}
          </div>
        </div>
        {(v.isPremium || v.hasBuddy) && <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-[12px] font-semibold text-emerald-800">Already {v.isPremium ? 'premium' : 'has a buddy'} — no sales ask needed.</p>}
      </div>

      {/* WHY they'll convert */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-emerald-600">Why this student will convert</p>
        {v.symptoms.length === 0 ? (
          <p className="text-sm text-stone-500">Few buying signals yet — warm them up first (get them logging), then pitch.</p>
        ) : (
          <ul className="space-y-1.5">
            {v.symptoms.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', s.strong ? 'text-emerald-600' : 'text-stone-400')} />
                <span className={cn(s.strong ? 'font-semibold text-stone-800' : 'text-stone-600')}>{s.label}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Their prep — reference on the call */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Their prep — reference this on the call</p>
        {v.prep.sections.length > 0 ? (
          <div className="space-y-1.5">
            {v.prep.sections.map((s) => (
              <div key={s.section} className="flex items-center gap-2.5">
                <span className="w-12 shrink-0 text-[12px] font-bold text-stone-700">{s.section}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-stone-100"><div className="h-full rounded-full bg-teal-500" style={{ width: `${s.pct}%` }} /></div>
                <span className="w-20 shrink-0 text-right font-mono text-[11px] text-stone-500">{s.pct}% ({s.finished}/{s.total})</span>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-stone-400">No study data yet.</p>}
        <div className="mt-3 flex flex-wrap gap-1.5 text-[11px]">
          <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">{v.prep.finished} finished · {v.prep.started} started · {v.prep.untouched} untouched</span>
          <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-600">{v.prep.activeDays14}/14 days studied</span>
          {v.prep.strongSection && <span className="rounded bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700">strong: {v.prep.strongSection}</span>}
          {v.prep.weakSection && <span className="rounded bg-rose-50 px-2 py-0.5 font-semibold text-rose-700">weak: {v.prep.weakSection}</span>}
        </div>
        {v.prep.topUntouched.length > 0 && (
          <p className="mt-2 text-[12px] text-stone-500">High-value topics still untouched: <span className="font-semibold text-stone-700">{v.prep.topUntouched.join(', ')}</span> — a buddy prioritizes exactly these.</p>
        )}
      </div>

      {/* Objection playbook */}
      <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
        <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">If they hesitate — say this</p>
        <div className="space-y-2.5">
          {v.objections.map((o, i) => (
            <div key={i}>
              <p className="text-[13px] font-bold text-stone-800">{o.objection}</p>
              <p className="text-[13px] text-stone-600">{o.response}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended buddy — a specific, relevant mentor beats "a buddy" */}
      {v.recommendedBuddy && (
        <div className="mt-3 rounded-2xl border border-purple-200 bg-purple-50 p-4">
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-purple-600">Recommend this buddy</p>
          <p className="text-[15px] font-bold text-stone-900">
            {v.recommendedBuddy.name}
            {v.recommendedBuddy.percentile != null && <span className="ml-1 text-[12px] font-semibold text-stone-500">{v.recommendedBuddy.percentile}%ile</span>}
            {v.recommendedBuddy.college && <span className="ml-1 text-[12px] font-semibold text-stone-500">· {v.recommendedBuddy.college}</span>}
          </p>
          {v.recommendedBuddy.reason && <p className="mt-0.5 text-[13px] text-stone-700">Why: {v.recommendedBuddy.reason}</p>}
          <p className="mt-1.5 text-[11px] text-stone-500">Name a real, relevant mentor on the call — it converts far better than pitching “a buddy.”</p>
        </div>
      )}

      {/* The pitch */}
      <div className="mt-3 rounded-2xl border-2 border-teal-600 bg-teal-50 p-4">
        <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-teal-700">Your opening pitch</p>
        <p className="text-[14px] leading-relaxed text-stone-800">{v.pitch}</p>
      </div>

      {/* Log the call */}
      <div className="mt-3">
        <QuickLog studentId={v.studentId} />
      </div>

      {/* Call history */}
      {v.history.length > 0 && (
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Call history</p>
          <div className="space-y-2">
            {v.history.map((h, i) => (
              <div key={i} className="border-l-2 border-stone-200 pl-3">
                <p className="text-[12px] font-semibold text-stone-700">{h.status ?? 'note'} · <span className="font-normal text-stone-400">{new Date(h.at).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}</span></p>
                {h.note && <p className="text-[12px] text-stone-600">{h.note}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
