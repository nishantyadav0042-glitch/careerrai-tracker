'use client';

import { useEffect, useRef, useState } from 'react';
import { Clock } from 'lucide-react';
import { hourOptions } from '@/lib/daily-hours';
import { track } from '@/lib/journey';

// "Your plan is built to Xh. You've been studying about Yh." — and then the
// student decides, because it is their number.
//
// Measured 16 Sep across the 804 students who have been given a routine:
// median claimed 5h/day, median actually studied by an active student 0.6h.
// The plan is not over-reaching — it faithfully builds the day the student
// asked for, and 413 of them personally confirmed that number. Then nothing
// ever mentions it again, and a five-hour day regenerates every morning while
// 83.7% of routines never receive a single tick.
//
// WHY THIS ASKS INSTEAD OF TRIMMING. daily-hours.ts carries the 6 Aug rule:
// the hours belong to the student, and nothing may derive, cap, trim or round
// them toward behaviour. That rule is right, and right for this exact case —
// fifteen hours from a sincere student is a real answer, and an app that
// quietly rewrites it to 0.6 has an opinion about a number it was only asked
// to hold. So this card carries evidence, not a decision.
//
// NO SHAME, AND NOTHING CLEVER. It states two numbers the student produced
// themselves and offers two buttons. There is no streak, no encouragement, no
// "you can do this", and no grading of the gap. A student who is told they are
// failing closes the app; a student who is shown a number moves it.
//
// KEEPING IS AN ANSWER, NOT A DISMISSAL. "Keep 5h" writes the same 5h through
// the same single writer, exactly as the confirmation card does — the route's
// own comment says confirming and changing are deliberately the same write,
// because both mean "this number is mine". That stamps study_hours_set_at,
// which is what suppresses this card for the cooldown. No new column, no new
// table, no dismissal state to go stale.

export function RightSizeHoursCard({
  claimedHours, observedHours, suggestedHours, loggedDays,
}: {
  claimedHours: number;
  observedHours: number;
  suggestedHours: number;
  loggedDays: number;
}) {
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const announced = useRef(false);

  const goingUp = suggestedHours > claimedHours;

  useEffect(() => {
    // Once per mount. Without the ref, React's development double-invoke
    // reports two impressions for one sighting and every rate below it is
    // halved — the denominator bug this repo has already paid for once.
    if (announced.current) return;
    announced.current = true;
    track('right_size_shown', { claimedHours, observedHours, suggestedHours, loggedDays, direction: goingUp ? 'under' : 'over' });
  }, [claimedHours, observedHours, suggestedHours, loggedDays, goingUp]);

  if (gone) return null;

  async function commit(value: number) {
    setBusy(true); setErr(null);
    const kept = value === claimedHours;
    try {
      const res = await fetch('/api/student/daily-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: value }),
      });
      if (!res.ok) throw new Error();
      // Recorded AFTER the write succeeds. An event for a save that failed is
      // worse than no event: it reports a decision the student never made.
      track(kept ? 'right_size_kept' : 'right_size_changed', { from: claimedHours, to: value, observedHours, loggedDays });
      // A changed number resizes today's plan, so the page must come back
      // fresh. Keeping changes nothing on screen, so the card just goes.
      if (kept) setGone(true);
      else window.location.reload();
    } catch {
      setErr('Could not save — try again.');
      setBusy(false);
    }
  }

  return (
    <section className="mb-3 rounded-2xl border-2 border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start gap-3">
        <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-widest text-amber-800">
            About your plan size
          </p>
          <p className="mt-1 text-[15px] font-bold leading-snug text-stone-900">
            Your plan is built to {claimedHours}h a day. Over your last {loggedDays} logged days
            you&apos;ve studied about {observedHours}h.
          </p>
          <p className="mt-1 text-[13px] leading-relaxed text-stone-700">
            {goingUp
              ? `You're doing more than you set. Want the plan to match?`
              : `A plan you can finish beats a plan that looks impressive. Your call — we won't change it on our own.`}
          </p>

          {!choosing ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button" disabled={busy} onClick={() => commit(suggestedHours)}
                className="rounded-xl bg-stone-900 px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60 active:scale-[0.98]"
              >
                Make it {suggestedHours}h
              </button>
              <button
                type="button" disabled={busy} onClick={() => commit(claimedHours)}
                className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-[13px] font-semibold text-stone-700 disabled:opacity-60"
              >
                Keep {claimedHours}h
              </button>
              <button
                type="button" disabled={busy} onClick={() => setChoosing(true)}
                className="px-1 text-[13px] font-semibold text-stone-500 underline underline-offset-2 disabled:opacity-60"
              >
                Pick another
              </button>
            </div>
          ) : (
            <div className="mt-3">
              <p className="mb-2 text-[12px] font-semibold text-stone-600">How many hours a day can you actually self-study?</p>
              <div className="flex flex-wrap gap-1.5">
                {hourOptions(claimedHours).map((h) => (
                  <button
                    key={h} type="button" disabled={busy} onClick={() => commit(h)}
                    className={`min-w-[44px] rounded-lg border px-2.5 py-2 text-[13px] font-bold disabled:opacity-60 ${
                      h === claimedHours
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
