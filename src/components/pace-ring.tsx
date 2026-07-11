'use client';

import { useState } from 'react';
import type { PaceResult } from '@/lib/study-pace';

// The daily-hours ring: the single number that keeps a student honest — "to
// finish YOUR syllabus by YOUR date, put in X hours today." The arc is % of
// the syllabus done BY HOURS OF WORK (a 30h topic counts for more than an 8h
// one), and the number auto-rises as catch-up when they fall behind, or falls
// when they bank extra — so the plan is never stale. Rescheduling the date
// recomputes everything instantly.
function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

const TONE: Record<PaceResult['status'], { ring: string; chipBg: string; chipText: string; label: string }> = {
  ahead:       { ring: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', label: 'Ahead of pace' },
  on_pace:     { ring: '#6366f1', chipBg: 'bg-indigo-50',  chipText: 'text-indigo-700',  label: 'Right on pace' },
  behind:      { ring: '#f59e0b', chipBg: 'bg-amber-50',   chipText: 'text-amber-700',   label: 'Catching up' },
  unrealistic: { ring: '#f43f5e', chipBg: 'bg-rose-50',    chipText: 'text-rose-700',    label: 'Very tight' },
  done:        { ring: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', label: 'Syllabus done' },
};

export function PaceRing({ pace, targetIso }: { pace: PaceResult; targetIso: string }) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const tone = TONE[pace.status];
  const R = 52;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - pace.completedPct / 100);

  const todayIso = new Date().toISOString().split('T')[0];

  async function saveDate() {
    if (!date) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/student/post-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syllabus_target_date: date }),
      });
      if (!res.ok) throw new Error();
      setEditing(false);
      // Full reload, not router.refresh(): the ring is server-rendered but
      // Today's Study Plan fetches client-side on mount — only a real reload
      // guarantees the ring, today's plan, and phase dates all re-sync to the
      // new date together (a partial refresh is how "6h ring, 3.5h plan"
      // mismatches happen).
      window.location.reload();
    } catch {
      setErr('Could not update — try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-4">
        {/* Ring */}
        <div className="relative shrink-0">
          <svg width="120" height="120" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r={R} fill="none" stroke="#f1f0ef" strokeWidth="9" />
            <circle
              cx="60" cy="60" r={R} fill="none" stroke={tone.ring} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 60 60)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {pace.status === 'done' ? (
              <span className="text-2xl">✅</span>
            ) : (
              <>
                <span className="text-[22px] font-extrabold leading-none text-stone-900">{pace.requiredPerDay}<span className="text-sm font-bold">h</span></span>
                <span className="text-[9px] font-semibold uppercase tracking-wide text-stone-400">per day</span>
              </>
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chipBg} ${tone.chipText}`}>{tone.label}</span>
          <p className="mt-1.5 text-sm font-bold text-stone-900">
            {pace.status === 'done'
              ? 'Syllabus complete — revision & mocks now'
              : pace.catchUpPerDay > 0
                ? <>{pace.committedPerDay ?? pace.requiredPerDay}h plan <span className="text-amber-600">+ {pace.catchUpPerDay}h catch-up</span></>
                : pace.aheadPerDay > 0
                  ? <>Only {pace.requiredPerDay}h needed — <span className="text-emerald-600">{pace.aheadPerDay}h/day ahead</span></>
                  : `${pace.requiredPerDay}h a day, steady`}
          </p>
          <p className="mt-0.5 text-xs text-stone-500">
            {pace.completedPct}% done · {pace.remainingHours}h left · {pace.daysLeft} day{pace.daysLeft === 1 ? '' : 's'} to go
          </p>
          <div className="mt-1 flex items-center gap-2 text-[11px]">
            <span className="text-stone-400">Finish by <span className="font-semibold text-stone-700">{fmt(targetIso)}</span></span>
            <button type="button" onClick={() => { setEditing((v) => !v); setErr(null); }} className="font-semibold text-indigo-600 underline-offset-2 hover:underline">
              Reschedule
            </button>
          </div>
        </div>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <input
            type="date"
            value={date}
            min={todayIso}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-900"
          />
          <button
            type="button"
            disabled={busy || !date}
            onClick={saveDate}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Set new date'}
          </button>
          {err && <span className="text-[11px] text-rose-600">{err}</span>}
          <span className="w-full text-[10.5px] text-stone-400">Your daily hours recalculate the moment you move the date.</span>
        </div>
      )}
    </div>
  );
}
