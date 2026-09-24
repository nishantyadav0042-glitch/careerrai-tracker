'use client';

import { useEffect, useState } from 'react';
import { WeeklyCoverageReview } from '@/components/weekly-coverage-review';
import { TOUR_DONE_EVENT, tourDone, notifAskVisible, insightVisible, logModalOpen } from '@/lib/first-run-events';

// Mounts the weekly coverage review once it's due.
//
// Mandatory, so it does NOT claim the shared once-per-day modal slot — that
// slot is for optional nudges (buddy, timetable), and a required checkpoint
// must not be silenced because an install prompt got there first. It does still
// wait for the first-run sequence to finish, so a brand-new student is never
// hit with a review on top of their tour.
//
// The server has already decided it's due before this mounts; the component
// re-checks and closes itself if the API disagrees.
export function CoverageReviewGate() {
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (done) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = false;

    const attempt = () => {
      if (shown) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (shown || !tourDone() || notifAskVisible() || insightVisible() || logModalOpen()) return;
        shown = true;
        setShow(true);
      }, 1200);
    };

    attempt();
    window.addEventListener(TOUR_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_DONE_EVENT, attempt);
    };
  }, [done]);

  if (!show || done) return null;
  return <WeeklyCoverageReview onDone={() => { setDone(true); setShow(false); }} />;
}
