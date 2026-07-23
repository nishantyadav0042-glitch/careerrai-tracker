'use client';

import { useEffect, useState } from 'react';
import { TOUR_KEY, TOUR_DONE_EVENT } from '@/lib/first-run-events';

// Tiny insight cloud (founder, 23 Jul): the LAST first-run beat, after
// notifications → tour. A very small cloud in the corner with a 4-5 word
// insight, shown for ~4.5s then gone on its own. Non-blocking (pointer-events
// none), once per device, installed-app only. Every word is derived from the
// student's own coverage map — nothing invented.
const KEY = 'cr_insight_cloud_v1';
const VISIBLE_MS = 4500;

function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export function InsightCloud({ weakest, fresh }: { weakest: string; fresh: boolean }) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!isStandalone()) return;
    try { if (localStorage.getItem(KEY)) return; } catch { return; }

    let hideTimer: ReturnType<typeof setTimeout> | null = null;
    let startTimer: ReturnType<typeof setTimeout> | null = null;

    const reveal = () => {
      try { if (localStorage.getItem(KEY)) return; } catch { return; }
      try { localStorage.setItem(KEY, '1'); } catch { /* ignore */ }
      setShow(true);
      hideTimer = setTimeout(() => setShow(false), VISIBLE_MS);
    };

    // The tour just ended → show right after. If the tour was already done
    // on a later first-run visit (they closed before seeing it), show shortly
    // after load instead of waiting for an event that won't fire again.
    let tourDone = false;
    try { tourDone = localStorage.getItem(TOUR_KEY) === '1'; } catch { /* ignore */ }
    if (tourDone) startTimer = setTimeout(reveal, 700);
    window.addEventListener(TOUR_DONE_EVENT, reveal);

    return () => {
      if (hideTimer) clearTimeout(hideTimer);
      if (startTimer) clearTimeout(startTimer);
      window.removeEventListener(TOUR_DONE_EVENT, reveal);
    };
  }, []);

  if (!show) return null;

  // 4-5 words, straight from their own map.
  const text = fresh ? 'Clean slate — start strong' : `${weakest} is your weak spot`;

  return (
    <div className="pointer-events-none fixed bottom-24 right-3 z-[70]">
      <style>{`@keyframes crCloudPop{0%{opacity:0;transform:translateY(10px) scale(.9)}14%{opacity:1;transform:translateY(0) scale(1)}84%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-6px) scale(.96)}}`}</style>
      <div className="relative" style={{ animation: 'crCloudPop 4.5s ease-in-out forwards' }}>
        {/* cloud puffs */}
        <div className="absolute -left-1 -top-2 h-4 w-4 rounded-full bg-white" />
        <div className="absolute left-3 -top-3 h-5 w-5 rounded-full bg-white" />
        <div className="absolute right-5 -top-2 h-4 w-4 rounded-full bg-white" />
        <div className="relative flex items-center gap-1.5 rounded-[22px] bg-white px-3.5 py-2 shadow-lg ring-1 ring-stone-100">
          <span className="text-sm">☁️</span>
          <span className="text-xs font-semibold text-stone-700">{text}</span>
        </div>
      </div>
    </div>
  );
}
