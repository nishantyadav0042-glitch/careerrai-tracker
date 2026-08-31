'use client';

import { useEffect, useRef, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { track } from '@/lib/journey';

// One optional link to somebody else's video, attached to the task it helps
// with. This is the whole of CareerRai's content position, rendered:
//
//   CareerRai does not provide content. CareerRai provides an execution path.
//
// The plan already tells a student to solve fifteen questions. The pain the
// founder named is that fifteen questions have to come from somewhere, and
// today the student is left to find them. This closes that gap without
// becoming a content library — see docs/RESOURCE-LINKING-PLAN-2026-08.md.
//
// Four rules are load-bearing and are enforced by shape here, not by comment:
//
//  1. NEVER HOSTED. An anchor to the original watch page, opened in the
//     student's own browser. No embed, no iframe, no proxy, no mirror. An
//     embed would put someone else's video inside our chrome and make us look
//     like the publisher — legally the interesting question, and commercially
//     a promise we have not earned.
//  2. NEVER MANDATORY. The task above stands on its own and is completable
//     without ever touching this. Nothing here gates the tick.
//  3. ONE LINK, NEVER A LIST. A list is a decision handed back to a student
//     who came here to be told what to do next.
//  4. THE SOURCE IS ALWAYS NAMED. Channel and real runtime, in the row, before
//     the tap. A student deserves to know whose video it is and what it will
//     cost them in minutes — and we are a commercial linker, which is the one
//     posture where knowing what you are pointing at actually matters.
//
// The runtime shown is the platform-read figure stored in topic-resources.ts,
// never a claimed one. Twenty-two of the researched durations were wrong, one
// by more than twenty minutes; a student who is told "13 min" and loses forty
// has been lied to by our plan, not by YouTube.

export interface TaskResource {
  intent: string;
  videoId: string;
  title: string;
  channel: string;
  realMinutes: number;
}

type Verdict = 'helped' | 'did_not';

// Why an intent maps to a verb: "Watch" is what the student is about to do.
// The intent itself ('practice_cat') is our vocabulary, not theirs.
const LEAD_IN: Record<string, string> = {
  concept: 'Learn it',
  practice_easy: 'Practice',
  practice_cat: 'CAT-level practice',
  exam_ready: 'Revise',
};

export function TaskResource({
  resource,
  topic,
  taskId,
}: {
  resource: TaskResource;
  topic: string | null;
  taskId: string;
}) {
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [opened, setOpened] = useState(false);
  const shown = useRef(false);

  const base = { topic, taskId, videoId: resource.videoId, intent: resource.intent, channel: resource.channel };

  // One impression per mount. Without this, "students ignore the links" and
  // "students never saw the links" are the same number, which is how the
  // Daily Pick rotation cost an hour of SQL (see journey.ts, daily_slot_served).
  useEffect(() => {
    if (shown.current) return;
    shown.current = true;
    track('resource_shown', base);
    // The row is static for the life of the mount; re-firing on every prop
    // identity change would inflate impressions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The student left for YouTube and came back. We cannot see what happened
  // over there — no watch time, no completion, nothing. This one tap is the
  // only honest outcome signal available, so it is the one we ask for, once.
  function ask(v: Verdict) {
    setVerdict(v);
    track('resource_verdict', { ...base, verdict: v });
  }

  return (
    // Stops the tap from reaching the task row, which would tick the task.
    // Opening a resource is not progress; claiming it was would corrupt the
    // completion data the whole planner reads from.
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <a
        href={`https://www.youtube.com/watch?v=${resource.videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => {
          setOpened(true);
          track('resource_opened', base);
        }}
        className="flex items-start gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 transition-colors hover:border-stone-300 hover:bg-stone-50"
      >
        <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-stone-400">
            {LEAD_IN[resource.intent] ?? 'Watch'} · optional
          </span>
          <span className="mt-0.5 block truncate text-[13px] font-semibold text-stone-800">
            {resource.title}
          </span>
          {/* Provenance and cost, before the tap, every time. */}
          <span className="mt-0.5 block text-[11px] text-stone-500">
            {resource.channel} on YouTube · {resource.realMinutes} min
          </span>
        </span>
      </a>

      {/* Only after they have actually gone. Asking "did it help?" about a
          link nobody opened would manufacture an opinion out of nothing. */}
      {opened && verdict === null && (
        <div className="mt-1.5 flex items-center gap-2 px-1">
          <span className="text-[11px] text-stone-500">Did that help?</span>
          <button
            type="button"
            onClick={() => ask('helped')}
            className="rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => ask('did_not')}
            className="rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
          >
            No
          </button>
        </div>
      )}

      {/* "No" is the answer worth having — the weekly link review is fed by
          exactly this, and a student who says it should see it was heard. */}
      {verdict !== null && (
        <p className="mt-1.5 px-1 text-[11px] text-stone-400">
          {verdict === 'helped' ? 'Good — noted.' : "Noted. We'll review this link."}
        </p>
      )}
    </div>
  );
}
