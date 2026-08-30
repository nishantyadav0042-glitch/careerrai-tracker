'use client';

import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { WeeklyCoverageReview } from '@/components/weekly-coverage-review';
import { track } from '@/lib/journey';

// ── "UPDATE WHERE I STAND", ON DEMAND ───────────────────────────────────────
//
// The coverage matrix already had a mandatory weekly checkpoint, and it works.
// What it did not have was a DOOR. It opened on its own schedule and could not
// be opened by the student, so someone who wanted to correct their syllabus
// status today had nowhere to go.
//
// On 30 Aug a student did the only thing the app actually offered her: she used
// Delete Account and signed up again, to re-answer the questions that decide her
// plan. That is the whole reason this button exists. Until now the only
// self-service "redo" affordance in the product was in the Danger zone — so
// destroying the account was not a mistake on her part, it was the single
// visible path to the thing she wanted.
//
// Deliberately NOT a new review flow: it mounts the SAME WeeklyCoverageReview
// the weekly gate mounts, so both doors write the same matrix through the same
// submit path and stamp coverage_reviewed_at the same way. A second
// implementation would drift, and this file exists to remove a reason to
// destroy data, not to add a second source of it.
export function UpdateCoverageButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => { track('tap', { what: 'update_coverage_on_demand' }); setOpen(true); }}
        className="flex w-full items-start gap-3 rounded-xl border border-stone-200 bg-white p-4 text-left transition-colors hover:border-stone-900 active:scale-[0.99]"
      >
        <RefreshCw className="mt-0.5 h-5 w-5 shrink-0 text-stone-700" />
        <span>
          <span className="block text-sm font-semibold text-stone-900">Update where you stand</span>
          <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">
            Changed since you started, or answered something wrong? Update your syllabus status and
            your plan rebuilds around it. Your streak, logs and history stay exactly as they are.
          </span>
        </span>
      </button>

      {open && <WeeklyCoverageReview onDemand onDone={() => setOpen(false)} />}
    </>
  );
}
