import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { ArrowLeft, Phone } from 'lucide-react';
import { cn } from '@/lib/utils';
import { getStudent360 } from '@/lib/student-360';
import { bandMeta } from '@/lib/momentum';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Student 360 · CareerRai' };

const BAND_CLASS: Record<string, string> = {
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  teal: 'bg-teal-50 text-teal-700 border-teal-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  orange: 'bg-orange-50 text-orange-800 border-orange-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
};
const URGENCY_CLASS: Record<string, string> = {
  now: 'bg-rose-600 text-white',
  soon: 'bg-orange-500 text-white',
  watch: 'bg-amber-100 text-amber-900',
  leave: 'bg-stone-100 text-stone-600',
};

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}

export default async function Student360Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) redirect('/login');
  const admin = createAdminClient();
  const { data: me } = await admin.from('profiles').select('role').eq('id', user.id).single();
  if (me?.role !== 'admin') redirect('/login');

  const s = await getStudent360(admin, id);
  if (!s) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center text-sm text-stone-500">
        Student not found. <Link href="/admin" className="underline">Back to dashboard</Link>
      </div>
    );
  }

  const bm = bandMeta(s.momentum.band);
  const wa = waNumber(s.profile.phone);
  const reachLabel = s.reach.hasLiveSub
    ? (s.reach.verifiedDaysAgo != null && s.reach.verifiedDaysAgo <= 3 ? 'Healthy · delivery verified' : 'Reachable · not yet verified')
    : s.reach.prefsPush ? 'Disconnected — wants push, sub dead' : 'Not opted in to push';
  const reachTone = s.reach.hasLiveSub ? 'text-emerald-700' : s.reach.prefsPush ? 'text-rose-600' : 'text-stone-500';

  return (
    <div className="min-h-screen bg-stone-50">
      <div className="mx-auto max-w-2xl px-4 py-6 pb-24">
        <Link href="/admin" className="mb-3 inline-flex items-center gap-1.5 text-xs font-semibold text-stone-500 hover:text-stone-800">
          <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
        </Link>

        {/* Header: who + momentum + one action */}
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-xl font-bold text-stone-900">{s.profile.full_name ?? 'Student'}</h1>
              <p className="text-xs text-stone-500">{s.profile.phone ?? 'no phone'}</p>
              <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold">
                <span className={cn('rounded-full border px-2 py-0.5', BAND_CLASS[bm.color])}>{bm.label} · {s.momentum.score}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{s.profile.isPremium ? 'premium' : s.profile.hasBuddy ? 'has buddy' : 'free'}</span>
                <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-600">{s.profile.appInstalled ? 'installed' : 'no app'}</span>
                {s.profile.joinedDaysAgo != null && <span className="rounded-full bg-stone-100 px-2 py-0.5 text-stone-500">joined {s.profile.joinedDaysAgo}d ago</span>}
              </div>
            </div>
            {wa && (
              <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#25d366] px-3 py-2 text-[13px] font-bold text-[#04331c] active:scale-95">
                <Phone className="h-3.5 w-3.5" /> WhatsApp
              </a>
            )}
          </div>
          {/* The recommended action — every view ends in a decision, not a number. */}
          <div className={cn('mt-3 rounded-xl px-3 py-2.5 text-sm font-semibold', URGENCY_CLASS[s.momentum.recommendedAction.urgency])}>
            {s.momentum.recommendedAction.urgency === 'now' ? '⚡ ' : ''}{s.momentum.recommendedAction.text}
          </div>
        </div>

        {/* Momentum breakdown — WHY the score is what it is */}
        <div className="mt-3 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-widest text-stone-400">Why this momentum</p>
          <div className="space-y-1.5">
            {s.momentum.factors.map((f, i) => (
              <div key={i} className="flex items-center justify-between text-sm">
                <span className="text-stone-700">{f.label}</span>
                <span className={cn('font-mono text-xs font-bold', f.points > 0 ? 'text-emerald-600' : f.points < 0 ? 'text-rose-500' : 'text-stone-400')}>
                  {f.points > 0 ? '+' : ''}{f.points}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Quick facts */}
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Fact label="Reachability" value={reachLabel} tone={reachTone} />
          <Fact label="Logs total" value={String(s.facts.logsTotal)} />
          <Fact label="Last log" value={s.facts.lastLogDate ?? 'never'} />
          <Fact label="Studied (14d)" value={`${s.momentum.signals.activeDays14}/14`} />
        </div>

        {/* Capacity Engine — believe behaviour, not the claimed number */}
        <div className={cn('mt-3 rounded-2xl border p-4', s.capacity.trust === 'behaviour' ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-white')}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">Capacity Engine</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-white px-2 py-0.5 font-semibold text-stone-700 ring-1 ring-stone-200">entered {s.capacity.claimedHours ?? '?'}h</span>
            {s.capacity.typicalStudyHours != null && <span className="rounded bg-white px-2 py-0.5 font-semibold text-stone-700 ring-1 ring-stone-200">studies ~{s.capacity.typicalStudyHours}h</span>}
            <span className={cn('rounded px-2 py-0.5 font-bold', s.capacity.trust === 'behaviour' ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white')}>plan sized to {s.capacity.sustainableHours ?? '?'}h</span>
          </div>
          <p className="mt-1.5 text-[12px] text-stone-600">{s.capacity.note}</p>
        </div>

        {/* Adaptation Engine — learned pace: how much work fits inside those hours */}
        <div className={cn('mt-3 rounded-2xl border p-4', s.adaptation.trust === 'learning' ? 'border-indigo-200 bg-indigo-50' : 'border-stone-200 bg-white')}>
          <p className="mb-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">Adaptation Engine</p>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="rounded bg-white px-2 py-0.5 font-semibold text-stone-700 ring-1 ring-stone-200">
              {s.adaptation.completionRatio != null ? `finishes ~${Math.round(s.adaptation.completionRatio * 100)}% of the plan` : 'no plan-days yet'}
            </span>
            {s.adaptation.planFitCount > 0 && (
              <span className="rounded bg-white px-2 py-0.5 font-semibold text-stone-700 ring-1 ring-stone-200">{s.adaptation.planFitCount} plan-fit tap{s.adaptation.planFitCount === 1 ? '' : 's'}</span>
            )}
            <span className={cn('rounded px-2 py-0.5 font-bold', s.adaptation.trust === 'learning' ? 'bg-indigo-500 text-white' : 'bg-stone-400 text-white')}>volume ×{s.adaptation.volumeFactor}</span>
          </div>
          <p className="mt-1.5 text-[12px] text-stone-600">{s.adaptation.note}</p>
        </div>

        {/* The timeline — the story */}
        <div className="mt-4 rounded-2xl border border-stone-200 bg-white p-4">
          <p className="mb-3 text-[11px] font-bold uppercase tracking-widest text-stone-400">Timeline</p>
          {s.timeline.length === 0 ? (
            <p className="text-sm text-stone-400">No activity yet.</p>
          ) : (
            <div className="space-y-0">
              {s.timeline.map((ev, i) => (
                <div key={i} className="flex gap-3 border-l border-stone-200 pb-3 pl-3 last:pb-0">
                  <span className="-ml-[1.35rem] flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-sm ring-1 ring-stone-200">{ev.icon}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-800">{ev.label}</p>
                    <p className="font-mono text-[10.5px] text-stone-400">
                      {new Date(ev.iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <div className={cn('text-sm font-bold text-stone-900', tone)}>{value}</div>
      <div className="mt-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-stone-400">{label}</div>
    </div>
  );
}
