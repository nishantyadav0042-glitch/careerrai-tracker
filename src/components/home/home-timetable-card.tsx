'use client';

import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { TimetableCard } from '@/components/timetable-card';

// The Add-Timetable option ON the home screen (founder S3, 10 Aug), with his
// exact rule: "if a student says cancel, remove it from homescreen." The ✕
// remembers the choice on this device forever; the card stays reachable in
// Profile → Settings, so nothing is lost — only the home screen gets quieter.
// TimetableCard itself already self-hides for students with no coaching.
const DISMISS_KEY = 'cr_home_timetable_dismissed';

export function HomeTimetableCard() {
  const [dismissed, setDismissed] = useState(true); // hidden until we check storage

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reading a
       device-local choice; there is no server value to seed this from */
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1'); } catch { setDismissed(false); }
  }, []);

  if (dismissed) return null;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Remove from home screen"
        title="Remove — you can still find this in Profile → Settings"
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked */ }
          setDismissed(true);
        }}
        className="absolute right-2 top-2 z-10 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      >
        <X className="h-4 w-4" />
      </button>
      <TimetableCard />
    </div>
  );
}
