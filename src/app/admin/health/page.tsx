'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Activity, RefreshCw, AlertTriangle } from 'lucide-react';

// The morning screen. Not Mixpanel, not Supabase — this.
//
// It leads with the only question that decides whether CareerRai works: how
// many students came to study today, and how many completed today's log.
// Capability health sits UNDERNEATH it, because every invariant, registry and
// contract exists to protect that journey. A health board that shows green
// ticks above the outcome it protects is engineering admiring itself.

interface Violation { invariant: string; violations: number; severity: string }
interface Capability {
  capability: string; tier: number; checks: number; failing: number;
  status: string; worst: string | null; violations: Violation[];
}
interface Health {
  studyDay: string;
  theOneKpi: {
    studentsTotal: number; openedToday: number; loggedToday: number;
    openToLogPct: number | null; loggedOfAllPct: number | null;
  };
  integrity: { invariantsChecked: number; failing: number; tier0Failing: number; runtimeMs: number; claim: string };
  capabilities: Capability[];
  unowned: { capability: string; why: string }[];
}

export default function CapabilityHealth() {
  const [h, setH] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setBusy(true);
    const res = await fetch('/api/admin/capability-health');
    if (res.ok) setH((await res.json()) as Health);
    setBusy(false);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  if (!h) return <div className="p-6 text-sm text-stone-400">Loading…</div>;

  const k = h.theOneKpi;

  return (
    <div className="min-h-screen bg-stone-50 p-4">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="rounded-lg p-2 hover:bg-stone-100"><ArrowLeft className="h-5 w-5 text-stone-600" /></Link>
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-stone-900"><Activity className="h-4 w-4 text-white" /></span>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-bold text-stone-900">Capability Health</h1>
            <p className="text-xs text-stone-500">Study day {h.studyDay}</p>
          </div>
          <button type="button" onClick={() => void load()} disabled={busy}
            className="rounded-lg bg-white p-2 shadow-sm disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 text-stone-600 ${busy ? 'animate-spin' : ''}`} />
          </button>
        </div>

        {/* ── THE ONE KPI ── */}
        <section className="rounded-3xl bg-stone-900 p-6 text-white">
          <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">
            The only question that matters
          </p>
          <p className="mt-1 text-sm text-stone-300">
            How many students came to study today, and how many completed today&apos;s log?
          </p>
          <div className="mt-5 flex items-end gap-8">
            <div>
              <p className="font-mono text-5xl font-bold leading-none">{k.loggedToday}</p>
              <p className="mt-1.5 text-xs text-stone-400">logged today</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold leading-none text-stone-400">{k.openedToday}</p>
              <p className="mt-1.5 text-xs text-stone-500">opened the app</p>
            </div>
            <div>
              <p className="font-mono text-3xl font-bold leading-none text-stone-500">{k.studentsTotal}</p>
              <p className="mt-1.5 text-xs text-stone-500">students exist</p>
            </div>
          </div>
          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-stone-400">
            {k.openToLogPct != null
              ? <>Of the students who opened, <span className="font-bold text-white">{k.openToLogPct}%</span> logged.</>
              : 'Nobody has opened the app yet today.'}
            {k.loggedOfAllPct != null && <> That is <span className="font-bold text-white">{k.loggedOfAllPct}%</span> of everyone.</>}
          </p>
        </section>

        {/* ── Capability integrity ── */}
        <section className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-sm font-bold text-stone-900">Capability integrity</h2>
            <span className="font-mono text-xs text-stone-400">
              {h.integrity.invariantsChecked} invariants · {h.integrity.runtimeMs}ms
            </span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed text-stone-500">{h.integrity.claim}</p>

          <div className="mt-3 space-y-1.5">
            {h.capabilities.map((c) => (
              <div key={c.capability} className="flex items-center gap-2.5 border-b border-stone-50 py-1.5 last:border-0">
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.failing === 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-stone-800">{c.capability}</span>
                <span className="shrink-0 rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-500">
                  T{c.tier}
                </span>
                <span className="shrink-0 font-mono text-[11px] text-stone-400">{c.checks} checks</span>
                {c.failing > 0 && (
                  <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-700">
                    {c.failing} FAILING
                  </span>
                )}
              </div>
            ))}
          </div>

          {h.capabilities.some((c) => c.failing > 0) && (
            <div className="mt-3 space-y-1 rounded-xl bg-rose-50 p-3">
              {h.capabilities.flatMap((c) => c.violations.map((v) => (
                <p key={`${c.capability}-${v.invariant}`} className="text-[11px] text-rose-800">
                  <span className="font-bold">{c.capability}:</span> {v.invariant} — {v.violations} row(s)
                </p>
              )))}
            </div>
          )}
        </section>

        {/* ── The capabilities nobody owns ── */}
        {h.unowned.length > 0 && (
          <section className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <h2 className="text-sm font-bold text-amber-900">No contract ({h.unowned.length})</h2>
            </div>
            <p className="mt-1 text-[11px] text-amber-800">
              These exist in the product and have zero invariants. A capability nobody
              has named is one nobody tests — and zero invariants is a worse position
              than weak ones, because it looks identical to healthy from here.
            </p>
            <div className="mt-2.5 space-y-1">
              {h.unowned.map((u) => (
                <p key={u.capability} className="text-[12px] text-amber-900">
                  <span className="font-bold">{u.capability}</span>
                  <span className="text-amber-700"> — {u.why}</span>
                </p>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
