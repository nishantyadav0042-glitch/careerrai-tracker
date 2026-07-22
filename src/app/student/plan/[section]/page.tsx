'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { cn } from '@/lib/utils';

// Section-agnostic Mastery plan screen (QA / DILR / VARC). The section comes
// from the route (/student/plan/qa, /student/plan/dilr); everything else is the
// same UI. Gated server-side by the section's <section>_model_enabled flag.

const STAGE_LABEL: Record<string, string> = {
  concept: 'Concept', easy: 'Easy', medium: 'Medium', hard: 'Hard', exam_ready: 'Exam Ready',
};

interface Slot {
  topic: string; cluster: string; stageLabel: string; stageNumber: number; stageTotal: number;
  sessionsToday: number; minutes: number; sessionsRemainingAtStage: number; target: string; why: string;
}
interface Plan {
  enabled: boolean; allDone?: boolean; budgetMinutes: number; label?: string;
  core: { mastered: number; total: number };
  revision: { topic: string; reason: string; minutes: number } | null;
  priority?: Slot; secondary?: Slot | null;
  swapOptions?: { topic: string; cluster: string; weightage: number }[];
}

export default function MasteryPlanPage() {
  const params = useParams();
  const section = String(params?.section ?? 'qa').toLowerCase();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [state, setState] = useState<'loading' | 'off' | 'ready' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const [needMore, setNeedMore] = useState<string | null>(null);
  const [swapFor, setSwapFor] = useState<'priority' | 'secondary' | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // Auto-dismiss the confirmation toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/mastery/${section}/today`);
      if (res.status === 404) { setState('off'); return; }
      if (!res.ok) { setState('error'); return; }
      setPlan(await res.json());
      setState('ready');
    } catch { setState('error'); }
  }, [section]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch-on-mount; setState only after the awaited response
  useEffect(() => { load(); }, [load]);

  const post = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    try {
      const res = await fetch(`/api/mastery/${section}/log`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) { alert(j.error ?? 'Something went wrong'); return; }
      navigator.vibrate?.(30);
      // Confirm the tap did something — the same topic climbs stages in place,
      // so without this "Got it" reads as if nothing happened.
      const topic = String(body.topic ?? '');
      if (body.action === 'study') {
        if (j.stageCleared && j.newStage === 'exam_ready') setToast(`🎉 ${topic} is Exam Ready!`);
        else if (j.stageCleared) setToast(`✓ ${topic} moved up to ${STAGE_LABEL[j.newStage as string] ?? 'the next stage'}`);
        else setToast(`✓ Saved — ${topic} is moving up`);
      } else if (body.action === 'revision') {
        setToast(body.wentCold ? `Saved — ${topic} back for revision` : `✓ ${topic} still fresh`);
      } else if (body.action === 'swap') {
        setToast(`✓ Swapped to ${topic}`);
      }
      setNeedMore(null); setSwapFor(null);
      await load();
    } finally { setBusy(null); }
  };

  if (state === 'loading') return <Shell><p className="text-zinc-500 text-sm">Loading your plan…</p></Shell>;
  if (state === 'off') return <Shell><Card><p className="text-sm text-zinc-300">This plan isn&apos;t switched on for your account yet.</p></Card></Shell>;
  if (state === 'error' || !plan) return <Shell><Card><p className="text-sm text-rose-300">Couldn&apos;t load your plan. Pull to refresh.</p></Card></Shell>;

  const title = plan.label ? `Today's ${plan.label}` : "Today's plan";

  return (
    <Shell>
      <div className="mb-4">
        <h1 className="text-xl font-bold text-white">{title}</h1>
        <p className="mt-1 text-xs text-zinc-500">{plan.core.mastered} / {plan.core.total} core topics Exam Ready · ~{plan.budgetMinutes} min planned</p>
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-800">
          <div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.round((plan.core.mastered / Math.max(1, plan.core.total)) * 100)}%` }} />
        </div>
      </div>

      {plan.allDone && <Card><p className="text-sm font-semibold text-emerald-300">🎉 Every topic here is Exam Ready. Keep them warm with revision and mocks.</p></Card>}

      {plan.revision && (
        <div className="mb-3 rounded-2xl border border-teal-700/40 bg-teal-950/30 p-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-teal-400">🔖 Quick revision · {plan.revision.minutes} min</p>
          <p className="mt-1 text-base font-bold text-white">{plan.revision.topic}</p>
          <p className="mt-0.5 text-xs text-teal-300/90">{plan.revision.reason}</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button disabled={!!busy} onClick={() => post({ action: 'revision', topic: plan.revision!.topic, wentCold: false }, 'rev-fresh')}
              className="rounded-xl bg-teal-600 py-2.5 text-xs font-bold text-white active:scale-95 disabled:opacity-50">Still fresh ✓</button>
            <button disabled={!!busy} onClick={() => post({ action: 'revision', topic: plan.revision!.topic, wentCold: true }, 'rev-cold')}
              className="rounded-xl bg-zinc-800 py-2.5 text-xs font-bold text-zinc-300 active:scale-95 disabled:opacity-50">Went cold</button>
          </div>
        </div>
      )}

      {plan.priority && <TopicCard slot={plan.priority} isPriority busy={busy} needMore={needMore} setNeedMore={setNeedMore} onLog={post} onSwap={() => setSwapFor('priority')} />}
      {plan.secondary && <TopicCard slot={plan.secondary} busy={busy} needMore={needMore} setNeedMore={setNeedMore} onLog={post} onSwap={() => setSwapFor('secondary')} />}

      {swapFor && plan.swapOptions && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm" onClick={() => setSwapFor(null)}>
          <div className="w-full rounded-t-3xl border border-zinc-800 bg-zinc-950 p-5" onClick={(ev) => ev.stopPropagation()}>
            <p className="mb-1 text-sm font-bold text-white">Swap the {swapFor} topic</p>
            <p className="mb-3 text-xs text-zinc-500">Pick anything you&apos;d rather do — progress on the current one is kept.</p>
            <div className="max-h-[50vh] space-y-1.5 overflow-y-auto">
              {plan.swapOptions.length === 0 && <p className="text-xs text-zinc-500">Nothing else is unlocked to swap to right now.</p>}
              {plan.swapOptions.map((o) => (
                <button key={o.topic} disabled={!!busy} onClick={() => post({ action: 'swap', slot: swapFor, topic: o.topic }, `swap-${o.topic}`)}
                  className="flex w-full items-center justify-between rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 text-left active:scale-[0.99] disabled:opacity-50">
                  <span className="text-sm font-semibold text-white">{o.topic}</span>
                  <span className="text-[10px] uppercase tracking-wide text-zinc-500">{o.cluster}</span>
                </button>
              ))}
            </div>
            <button onClick={() => setSwapFor(null)} className="mt-3 w-full py-2 text-xs font-medium text-zinc-500">Cancel</button>
          </div>
        </div>
      )}

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4" aria-live="polite">
          <div className="rounded-full border border-zinc-700 bg-zinc-900/95 px-4 py-2.5 text-sm font-semibold text-white shadow-lg backdrop-blur">
            {toast}
          </div>
        </div>
      )}
    </Shell>
  );
}

function TopicCard({ slot, isPriority, busy, needMore, setNeedMore, onLog, onSwap }: {
  slot: Slot; isPriority?: boolean; busy: string | null; needMore: string | null;
  setNeedMore: (t: string | null) => void; onLog: (body: Record<string, unknown>, key: string) => void; onSwap: () => void;
}) {
  const asking = needMore === slot.topic;
  return (
    <div className={cn('mb-3 rounded-2xl border p-4', isPriority ? 'border-orange-500/40 bg-zinc-900 ring-1 ring-orange-500/20' : 'border-zinc-800 bg-zinc-900')}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-500">{isPriority ? 'Priority' : 'Second'} · {slot.cluster}</p>
        <button onClick={onSwap} className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300">⇄ Swap</button>
      </div>
      <p className="mt-1 text-lg font-bold text-white">{slot.topic}</p>
      <span className="mt-1.5 inline-block rounded-full bg-orange-500/15 px-2.5 py-0.5 text-[11px] font-bold text-orange-300">▲ Stage {slot.stageNumber}/{slot.stageTotal} · {slot.stageLabel}</span>
      <p className="mt-2 text-[13px] text-zinc-400">
        <b className="text-zinc-200">{slot.sessionsToday} session{slot.sessionsToday === 1 ? '' : 's'} ({slot.minutes} min)</b>
        {slot.sessionsRemainingAtStage === 0 ? ' · you finish this stage today' : ` · ${slot.sessionsRemainingAtStage} more after today`}
      </p>
      <p className="mt-1.5 text-[11px] italic text-zinc-600">{slot.why}</p>
      {!asking ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button disabled={!!busy} onClick={() => onLog({ action: 'study', topic: slot.topic, sessionsDone: slot.sessionsToday, gotIt: true }, `got-${slot.topic}`)}
            className="rounded-xl bg-orange-500 py-3 text-sm font-bold text-white active:scale-95 disabled:opacity-50">Got it ✓</button>
          <button disabled={!!busy} onClick={() => setNeedMore(slot.topic)}
            className="rounded-xl bg-zinc-800 py-3 text-sm font-bold text-zinc-300 active:scale-95 disabled:opacity-50">Need more</button>
        </div>
      ) : (
        <div className="mt-3">
          <p className="mb-2 text-[11px] text-zinc-500">What went wrong? (optional)</p>
          <div className="grid grid-cols-2 gap-2">
            <button disabled={!!busy} onClick={() => onLog({ action: 'study', topic: slot.topic, sessionsDone: slot.sessionsToday, gotIt: false, errorType: 'concept' }, `nm-c-${slot.topic}`)}
              className="rounded-xl bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-200 active:scale-95 disabled:opacity-50">Didn&apos;t get the concept</button>
            <button disabled={!!busy} onClick={() => onLog({ action: 'study', topic: slot.topic, sessionsDone: slot.sessionsToday, gotIt: false, errorType: 'calculation' }, `nm-x-${slot.topic}`)}
              className="rounded-xl bg-zinc-800 py-2.5 text-xs font-semibold text-zinc-200 active:scale-95 disabled:opacity-50">Calculation mistakes</button>
          </div>
          <button disabled={!!busy} onClick={() => onLog({ action: 'study', topic: slot.topic, sessionsDone: slot.sessionsToday, gotIt: false }, `nm-${slot.topic}`)}
            className="mt-2 w-full py-1.5 text-[11px] font-medium text-zinc-500">Skip — just log &ldquo;need more&rdquo;</button>
        </div>
      )}
    </div>
  );
}

function Shell({ children }: { children: React.ReactNode }) { return <div className="mx-auto max-w-md px-1 py-2">{children}</div>; }
function Card({ children }: { children: React.ReactNode }) { return <div className="rounded-2xl border border-zinc-800 bg-zinc-900 p-4">{children}</div>; }
