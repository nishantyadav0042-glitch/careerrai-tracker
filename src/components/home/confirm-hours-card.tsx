'use client';

import { useState } from 'react';
import { Clock, Check } from 'lucide-react';
import { hourOptions } from '@/lib/daily-hours';

// "Is this still your number?" — asked once, then never again.
//
// Until 6 Aug, rescheduling a finish date silently rewrote study_target_hours to
// whatever the new date demanded. It overwrote the value in place, so for every
// account that existed before today we genuinely cannot tell a number the
// student chose from one we imposed. Guessing would be worse than asking.
//
// Founder, 6 Aug: "any confusion for any student, ask them the question in app
// and then act, or confirm from them."
//
// So: one card, two taps, gone forever once answered. Confirming records that
// the number is theirs (study_hours_source = 'student') and nothing about their
// plan changes. Changing it sets a new number through the same single writer
// every other surface uses, and today's plan rebuilds to match immediately —
// which is the one and only case where a plan is allowed to change under a
// student mid-day, because they are the one who asked for it.

export function ConfirmHoursCard({ hours }: { hours: number }) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (gone) return null;

  async function commit(value: number) {
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/student/daily-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: value }),
      });
      if (!res.ok) throw new Error();
      // A changed number resizes today's plan, so the page has to come back
      // fresh. Confirming changes nothing, so it just disappears.
      if (value === hours) setGone(true);
      else window.location.reload();
    } catch {
      setErr('Could not save — try again.');
      setBusy(false);
    }
  }

  return (
    <section className="mb-3 rounded-2xl border-2 border-indigo-200 bg-indigo-50/60 p-4">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-indigo-600" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-700">
            One quick check
          </p>
          <p className="mt-1 text-[15px] font-bold leading-snug text-stone-900">
            Your plan is built to {hours} self-study hours a day. Still right?
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-700">
            We&apos;re asking because this number used to change on its own when you moved your finish date. It
            never will again — from now on it only changes when you change it.
          </p>

          {!choosing ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button" disabled={busy} onClick={() => commit(hours)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60 active:scale-[0.98]"
              >
                <Check className="h-3.5 w-3.5" />
                Yes, {hours}h is mine
              </button>
              <button
                type="button" disabled={busy} onClick={() => setChoosing(true)}
                className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-stone-700 disabled:opacity-60"
              >
                No, change it
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="mb-2 text-[12px] font-semibold text-stone-600">How many hours a day can you actually self-study?</p>
              <div className="flex flex-wrap gap-1.5">
                {hourOptions(hours).map((h) => (
                  <button
                    key={h} type="button" disabled={busy} onClick={() => commit(h)}
                    className={`min-w-[44px] rounded-lg border px-2.5 py-2 text-[13px] font-bold disabled:opacity-60 ${
                      h === hours
                        ? 'border-stone-900 bg-stone-900 text-white'
                        : 'border-stone-300 bg-white text-stone-800 hover:border-stone-500'
                    }`}
                  >
                    {h}h
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11.5px] leading-relaxed text-stone-500">
                Pick the number you can hit on an ordinary day, not your best one. Your finish date moves to fit
                it — that&apos;s the deal.
              </p>
            </div>
          )}

          {err && <p className="mt-2 text-[12px] font-semibold text-rose-600">{err}</p>}
        </div>
      </div>
    </section>
  );
}
