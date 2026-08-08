'use client';

import { useState } from 'react';
import { track } from '@/lib/journey';

// "Busy day (personal commitments)."
//
// This replaced the bad-day floor, which asked a student at signup to predict
// how bad their worst day would be. Nobody knows in July that the 14th of
// August will be a wedding. So the question is not asked in advance — it is
// answered on the day, by the person who knows.
//
// Deliberately quiet: small, grey, below the plan, no icon competing with the
// tasks. A student should find it when they need it and not be nudged toward
// it when they don't. The whole point is that using it is not a failure — so
// it must not look like a big red escape hatch either.
//
// Hidden for coaching students, because their answer is genuinely different:
// their plan is anchored to what class teaches on a date, and sliding it would
// leave them a day behind their own classroom. The server enforces that rule
// too (lib/busy-day) — this is the polite version of the same decision, and
// showing a button that always refuses would be worse than showing none.

interface Result {
  shifted: boolean;
  newTargetDate: string | null;
  hitExamWall: boolean;
  message: string;
}

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function BusyDayButton({ planSource }: { planSource: string | null }) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (planSource === 'coaching') return null;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/routine/busy-day', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not move today. Try again.');
        return;
      }
      setResult(json as Result);
      track('busy_day_used', { shifted: !!json.shifted, hitExamWall: !!json.hitExamWall });
    } catch {
      setError('Could not move today. Try again.');
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    return (
      <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
        <p className="text-[13px] font-semibold text-stone-800">Today has been moved</p>
        <p className="mt-1 text-[12.5px] leading-snug text-stone-600">{result.message}</p>
        {result.newTargetDate && (
          <p className="mt-1.5 text-[12px] text-stone-500">
            New finish date: <b className="text-stone-700">{fmt(result.newTargetDate)}</b>
          </p>
        )}
      </div>
    );
  }

  if (!asking) {
    return (
      <button
        type="button"
        onClick={() => setAsking(true)}
        className="w-full rounded-xl border border-stone-200 py-2.5 text-[12.5px] font-medium text-stone-500 transition-colors hover:border-stone-300 hover:text-stone-700"
      >
        Busy day? <span className="text-stone-400">(personal commitments)</span>
      </button>
    );
  }

  return (
    <div className="rounded-xl border border-stone-300 bg-white p-3">
      {/* Says exactly what will happen before it happens. A student who taps
          this while unsure whether it costs them their streak will not tap it
          twice. */}
      <p className="text-[13px] font-semibold text-stone-900">Move today to tomorrow?</p>
      <p className="mt-1 text-[12.5px] leading-snug text-stone-600">
        Today&apos;s topics come back tomorrow, first in line, and your finish date moves one day with them.
        Nothing is lost and nothing is marked missed.
      </p>
      {error && <p className="mt-2 text-[12px] text-red-600">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={() => setAsking(false)}
          disabled={busy}
          className="flex-1 rounded-lg border border-stone-300 py-2 text-[12.5px] font-medium text-stone-600"
        >
          Not today
        </button>
        <button
          type="button"
          onClick={confirm}
          disabled={busy}
          className="flex-1 rounded-lg bg-stone-900 py-2 text-[12.5px] font-semibold text-white disabled:opacity-60"
        >
          {busy ? 'Moving…' : 'Yes, I was busy'}
        </button>
      </div>
    </div>
  );
}
