'use client';

import { useEffect, useState } from 'react';
import { TimetableUpload, type CloseReason } from '@/components/timetable-upload';
import { claimDailyModal } from '@/lib/daily-modal';
import {
  NOTIF_ASK_SETTLED_EVENT, INSIGHT_DONE_EVENT,
  notifAskVisible, insightVisible, logModalOpen, setTimetableAskVisible,
} from '@/lib/first-run-events';

// Shows the timetable offer during a student's first days, and only then —
// a coaching timetable is worth most when it can shape the plan from the
// start, and asking on day 30 is just noise.
//
// Stage A order (founder, 8 Aug): this ask now comes BEFORE the tour — for a
// coaching student the photo-to-plan moment IS the first hour's wow, and a
// tour of screens means little before the plan is theirs. It still waits for
// the day-1 insight and the notification ask, never stacks on the log modal,
// claims the shared once-per-day modal slot, and announces itself so the tour
// stands down until it settles. A refusal is remembered locally, so "I don't
// go to coaching" is not asked twice.
const DECLINED_KEY = 'cr_timetable_declined';

export function TimetablePrompt() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(DECLINED_KEY)) return; } catch { /* storage blocked */ }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = false;

    const attempt = () => {
      if (shown) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (shown || notifAskVisible() || insightVisible() || logModalOpen()) return;
        if (claimDailyModal()) { shown = true; setShow(true); setTimetableAskVisible(true); }
      }, 1600);
    };

    attempt();
    window.addEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
    window.addEventListener(INSIGHT_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
      window.removeEventListener(INSIGHT_DONE_EVENT, attempt);
    };
  }, []);

  if (!show) return null;

  return (
    <TimetableUpload
      onClose={(reason: CloseReason) => {
        // Only an explicit "I don't go to coaching" silences this for good.
        // Tapping X used to set the same flag, which meant one stray dismissal
        // killed the feature forever — with no other way to reach it.
        // A saved timetable needs no flag: the server-side gate stops asking.
        if (reason === 'declined') {
          try { localStorage.setItem(DECLINED_KEY, '1'); } catch { /* ignore */ }
        }
        setShow(false);
        setTimetableAskVisible(false); // the tour may take the stage now
      }}
    />
  );
}
