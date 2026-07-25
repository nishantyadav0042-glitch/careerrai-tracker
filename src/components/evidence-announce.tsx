'use client';

import { useEffect, useState } from 'react';
import { CheckCircle2, X } from 'lucide-react';
import { claimDailyModal } from '@/lib/daily-modal';
import { track } from '@/lib/journey';
import {
  TOUR_DONE_EVENT, NOTIF_ASK_SETTLED_EVENT, INSIGHT_DONE_EVENT,
  tourDone, notifAskVisible, insightVisible, logModalOpen,
} from '@/lib/first-run-events';

// One-time announcement (founder decision, 25 Jul): accuracy logging exists —
// after Done, two numbers, real progress. Students who never tap Done would
// otherwise never discover it, and evidence capture only matters if it is
// used.
//
// Same discipline as every other auto-shown surface: waits for the first-run
// sequence, never stacks on the log modal, claims the shared once-per-day
// modal slot, and once seen (or dismissed) never returns. One message, once.
const SEEN_KEY = 'cr_evidence_announce_seen';

export function EvidenceAnnounce() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch { /* storage blocked */ }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = false;

    const attempt = () => {
      if (shown) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (shown || !tourDone() || notifAskVisible() || insightVisible() || logModalOpen()) return;
        if (claimDailyModal()) {
          shown = true;
          setShow(true);
          track('evidence_announce_shown', {});
        }
      }, 1600);
    };

    attempt();
    window.addEventListener(TOUR_DONE_EVENT, attempt);
    window.addEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
    window.addEventListener(INSIGHT_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_DONE_EVENT, attempt);
      window.removeEventListener(NOTIF_ASK_SETTLED_EVENT, attempt);
      window.removeEventListener(INSIGHT_DONE_EVENT, attempt);
    };
  }, []);

  function dismiss() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
    track('evidence_announce_dismissed', {});
    setShow(false);
  }

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="w-full max-w-sm rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-600">
            <CheckCircle2 className="h-5 w-5 text-white" />
          </span>
          <button type="button" onClick={dismiss} aria-label="Close" className="text-stone-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 text-[16px] font-bold text-stone-900">
          New: log your correct answers
        </p>
        {/* Benefit first, mechanics second — same copy lesson as the
            timetable card ("students won't understand what this is for"). */}
        <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">
          After you finish a topic, tell us two numbers — how many questions you
          tried and how many were right. Your progress then shows what you can
          actually score on, not just what you&apos;ve read.
        </p>

        <button
          type="button" onClick={dismiss}
          className="mt-4 w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white active:scale-[0.99]"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
