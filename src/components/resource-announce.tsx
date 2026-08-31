'use client';

import { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { claimDailyModal } from '@/lib/daily-modal';
import { track } from '@/lib/journey';

// ── One-time announcement: tasks on new topics now carry a lesson link ───────
//
// There is a hard lesson attached to this file. The last announcement in this
// codebase (EvidenceAnnounce, removed 22 Aug) kept telling students "log your
// correct answers" for eight days after the capture UI had been deleted — we
// advertised the one capability the product did not have, to the students who
// most needed it. Zero students ever logged a practice outcome.
//
// So the copy below promises exactly what shipped and nothing beyond it:
//   · a link appears on a topic you are STARTING, not on every task
//   · it is optional and changes nothing about the task
//   · practice tasks have no link, and it says so
//
// That last line is deliberate. The obvious student reaction to a link on one
// task is "why not on my other three?" — better they hear the honest answer
// from us than conclude the feature is broken.
const SEEN_KEY = 'cr_resource_announce_v1';

export function ResourceAnnounce() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    try { if (localStorage.getItem(SEEN_KEY)) return; } catch { /* storage blocked */ }
    // Settle first so this never lands on top of the log modal or a first-run
    // ask, then take the shared daily slot — at most one auto-modal a day,
    // whoever gets there first. Attention is finite in the app too.
    const t = setTimeout(() => {
      if (!claimDailyModal()) return;
      setShow(true);
      track('resource_announce_shown', {});
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  if (!show) return null;

  function close() {
    try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* storage blocked */ }
    track('resource_announce_dismissed', {});
    setShow(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center">
      <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-orange-50">
            <BookOpen className="h-4.5 w-4.5 text-orange-600" aria-hidden="true" />
          </span>
          <h2 className="text-[15px] font-bold text-stone-900">New: a lesson link on new topics</h2>
        </div>

        <p className="mt-3 text-[13.5px] leading-relaxed text-stone-600">
          When today&rsquo;s plan gives you a topic you haven&rsquo;t started yet, the task now
          carries <strong className="text-stone-800">one optional link</strong> to a free lesson that
          teaches it — with the channel and the real length shown before you tap.
        </p>
        <p className="mt-2 text-[13.5px] leading-relaxed text-stone-600">
          It opens on YouTube, it changes nothing about your task, and you can ignore it entirely.
        </p>
        <p className="mt-2 text-[12.5px] leading-relaxed text-stone-500">
          Practice tasks don&rsquo;t have links yet — a video of somebody solving questions is not
          practice, so we&rsquo;d rather leave it empty until we have real question sets for you.
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-stone-500">
          If a lesson doesn&rsquo;t help, tap <strong className="text-stone-700">Not helpful</strong> under
          it. We read every one of those.
        </p>

        <button
          type="button"
          onClick={close}
          className="mt-4 w-full rounded-xl bg-stone-900 py-2.5 text-[14px] font-semibold text-white hover:bg-stone-800"
        >
          Got it
        </button>
      </div>
    </div>
  );
}
