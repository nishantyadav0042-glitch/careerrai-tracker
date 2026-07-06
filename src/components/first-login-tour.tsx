'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Mandatory one-time first-login screen — a single hero slide, not a
// marketing carousel. CareerRai is an exam buddy: one IIM senior, 1-on-1
// guidance — never "coaching," never a batch. This one slide says that,
// then hands off straight to the CAT Blueprint questions (OnboardingGate),
// rather than making a new student sit through several explainer screens
// before the app asks anything about them. Gated by
// student_engagement.tour_completed; shown once to free non-demo students.

function BuddyVisual() {
  return (
    <div className="w-full max-w-[300px] rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-600 text-lg font-bold text-white">A</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900">Arjun · your buddy</p>
          <p className="text-[11px] font-medium text-teal-700">IIM Ahmedabad · 99.2%ile</p>
        </div>
        <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
      </div>
      <div className="mt-3 rounded-2xl rounded-tl-sm bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-900">
        Saw your mock — your DILR timing is the gap, not your accuracy. Let&apos;s fix set-selection this week. 💪
      </div>
    </div>
  );
}

export function FirstLoginTour() {
  const [finishing, setFinishing] = useState(false);

  function finish() {
    setFinishing(true);
    fetch('/api/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'tour_completed' }),
    })
      .catch(() => {})
      .finally(() => window.location.reload());
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-white bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-6">
        <div className="flex flex-1 items-center justify-center py-6">
          <BuddyVisual />
        </div>

        <div className="text-center">
          <span className="mb-3 inline-block rounded-full bg-orange-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
            What makes us different
          </span>
          <h1 className="text-[26px] font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            An IIM senior. 1-on-1. Only yours.
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-600">
            Not coaching. Not a batch of 200. One exam buddy who cracked CAT at 95%ile+, who knows your name,
            your weak sections, and your last mock — and builds your CAT Blueprint around you.
          </p>
        </div>

        <div className="mt-7">
          <Button onClick={finish} variant="primary" size="lg" className="w-full" disabled={finishing}>
            {finishing ? 'Setting up…' : 'Start my prep →'}
          </Button>
        </div>
      </div>
    </div>
  );
}
