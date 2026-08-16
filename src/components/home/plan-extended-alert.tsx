'use client';

import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

// The one warning a student gets about falling behind. Once a week.
//
// Founder, 6 Aug: "warning should be weekly not daily... like you studied this
// much hours lesser so your target date extended by this much."
//
// It replaces a red banner that appeared EVERY morning and accused a
// nine-day-streak student of "breaching" their plan. The difference is not
// tone, it is honesty about consequence: their hours were never the app's to
// change, so the thing that gives is the date, and they hear about it once,
// with the numbers.
//
// Dismissible on purpose. They have read it; making them read it again on
// Tuesday is the exact nagging this replaced.
//
// The dismiss must outlive this component. Local state alone (16 Aug bug
// report) resets on every reload, so the X persists to the row itself via
// /api/plan/dismiss-extension — the server-side query in tracker/page.tsx
// then excludes it permanently, not just for this tab.

export interface PlanExtension {
  id: string;
  weekStart: string;
  expectedHours: number;
  actualHours: number;
  deficitHours: number;
  daysAdded: number;
  previousDate: string;
  newDate: string;
  hitExamWall: boolean;
}

const pretty = (isoDate: string) =>
  new Date(isoDate + 'T00:00:00Z').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', timeZone: 'UTC',
  });

export function PlanExtendedAlert({ extension }: { extension: PlanExtension }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const { hitExamWall, daysAdded } = extension;

  const dismiss = () => {
    setDismissed(true); // optimistic — the tap must feel instant
    fetch('/api/plan/dismiss-extension', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: extension.id }),
      keepalive: true,
    }).catch(() => { /* best-effort; worst case it reappears next load and can be dismissed again */ });
  };

  return (
    <section
      className={`mb-3 rounded-2xl border-2 p-4 ${
        hitExamWall ? 'border-red-300 bg-red-50' : 'border-orange-300 bg-orange-50'
      }`}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle className={`mt-0.5 h-5 w-5 shrink-0 ${hitExamWall ? 'text-red-600' : 'text-orange-600'}`} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className={`text-[10px] font-bold uppercase tracking-widest ${hitExamWall ? 'text-red-700' : 'text-orange-700'}`}>
              {hitExamWall ? 'Your date cannot move again' : 'Your finish date has moved'}
            </p>
            <button
              type="button"
              onClick={dismiss}
              aria-label="Dismiss"
              className="-mt-1 shrink-0 rounded-lg p-1 text-stone-400 hover:bg-black/5 hover:text-stone-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* The headline is the date, because that is the consequence. */}
          {!hitExamWall && (
            <p className="mt-1 text-[15px] font-bold leading-snug text-stone-900">
              {pretty(extension.previousDate)} → {pretty(extension.newDate)}
              <span className="ml-1.5 text-[13px] font-semibold text-orange-700">
                +{daysAdded} day{daysAdded === 1 ? '' : 's'}
              </span>
            </p>
          )}

          <p className="mt-1 text-[13.5px] leading-relaxed text-stone-800">
            Last week your plan needed <strong>{extension.expectedHours}h</strong> and you
            studied <strong>{extension.actualHours}h</strong> — {extension.deficitHours}h short.
            {hitExamWall
              ? ' Your finish date is already on exam day, so it cannot move again. From here every missed hour comes out of your revision time.'
              : ' Your hours have not changed. Only the date has.'}
          </p>

          <p className="mt-2 text-[11.5px] leading-relaxed text-stone-500">
            Hit your hours this week and the date stays exactly where it is.
          </p>
        </div>
      </div>
    </section>
  );
}
