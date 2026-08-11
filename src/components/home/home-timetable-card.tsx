'use client';

import { useCallback, useEffect, useState } from 'react';
import { X, CalendarClock } from 'lucide-react';
import { CoachingMirror } from '@/components/coaching-mirror';
import { TimetableUpload } from '@/components/timetable-upload';

// The ONE timetable surface on the home screen (founder S3, 10 Aug — and the
// 10 Aug triple-card fix: mounting CoachingMirror alongside TimetableCard,
// which nests its own CoachingMirror, put THREE upload prompts on one screen).
//
// This component now owns the home timetable slot alone:
//   · timetable saved   → the CoachingMirror progress view (no prompt at all)
//   · no timetable      → ONE prompt card, whose ✕ removes it from the home
//                         screen forever on this device (founder's rule); the
//                         full card stays reachable in Profile → Settings
//   · not coaching-enrolled and never uploaded → hidden entirely
const DISMISS_KEY = 'cr_home_timetable_dismissed';

export function HomeTimetableCard() {
  const [dismissed, setDismissed] = useState(true); // hidden until storage read
  const [hasTimetable, setHasTimetable] = useState<boolean | null>(null); // null = loading
  const [hidden, setHidden] = useState(false);
  const [open, setOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/timetable');
      const json = await res.json();
      const blocks = json.timetable?.blocks ?? null;
      setHasTimetable(Array.isArray(blocks) && blocks.length > 0);
      if (json.coachingEnrolled === false && !json.timetable) setHidden(true);
    } catch {
      setHasTimetable(false);
    }
  }, []);

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reading a
       device-local choice; there is no server value to seed this from */
    try { setDismissed(localStorage.getItem(DISMISS_KEY) === '1'); } catch { setDismissed(false); }
    void load();
  }, [load]);

  if (hidden || hasTimetable === null) return null;

  // A saved timetable: show the progress mirror, never a prompt.
  if (hasTimetable) return <CoachingMirror />;

  // No timetable: one dismissible prompt.
  if (dismissed) return null;

  return (
    <div className="relative rounded-2xl border border-stone-200 bg-white p-4">
      <button
        type="button"
        aria-label="Remove from home screen"
        title="Remove — you can still find this in Profile → Settings"
        onClick={() => {
          try { localStorage.setItem(DISMISS_KEY, '1'); } catch { /* storage blocked */ }
          setDismissed(true);
        }}
        className="absolute right-2 top-2 rounded-lg p-1.5 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex items-start gap-3 pr-6">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
          <CalendarClock className="h-5 w-5 text-white" />
        </span>
        <div>
          <p className="text-sm font-bold text-stone-900">Have a class timetable?</p>
          <p className="mt-0.5 text-sm leading-relaxed text-stone-600">
            Take a photo of it. Your daily plan here will follow the same topics as your class.
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3.5 w-full rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white active:scale-[0.99]"
      >
        Add my timetable
      </button>

      {open && (
        <TimetableUpload
          onClose={(reason) => {
            setOpen(false);
            if (reason === 'saved') void load();
          }}
        />
      )}
    </div>
  );
}
