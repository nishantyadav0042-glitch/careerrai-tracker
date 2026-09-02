'use client';

import { useEffect, useReducer } from 'react';
import { ExternalLink } from 'lucide-react';
import { track } from '@/lib/journey';
import {
  reduceFeedback, initialFeedback, canOfferSecondary, shouldAskVerdict, shouldOfferNotOpened,
  type Verdict, type FeedbackState, type FeedbackAction,
} from '@/lib/resource-feedback';

// One optional link to somebody else's video, attached to the task it helps
// with. This is the whole of CareerRai's content position, rendered:
//
//   CareerRai does not provide content. CareerRai provides an execution path.
//
// Four rules are load-bearing and are enforced by shape here, not by comment:
//
//  1. NEVER HOSTED. An anchor to the original watch page, opened in the
//     student's own browser. No embed, no iframe, no proxy, no mirror.
//  2. NEVER MANDATORY. The task above stands on its own and is completable
//     without ever touching this. Nothing here gates the tick.
//  3. ONE LINK, NEVER A LIST. A list is a decision handed back to a student
//     who came here to be told what to do next. The secondary below does not
//     break this: it REPLACES the primary in the same anchor, and only after
//     the student has told us the primary did not help. Never side by side.
//  4. THE SOURCE IS ALWAYS NAMED. Channel and real runtime, in the row, before
//     the tap.
//
// The runtime shown is the platform-read figure from topic-resources.ts, never
// a claimed one. A student told "13 min" who loses forty was misled by our
// plan, not by YouTube.
//
// WHAT THE FEEDBACK IS FOR: catching a wrong or broken link, and nothing else.
// It is NOT a ranking input. A beginner, a repeater, a Hindi speaker and
// somebody with twenty minutes will judge the same video differently, so
// ranking on thin data would launder noise into a recommendation. Collect
// first. See docs/phase0/RESOURCE-ARCHITECTURE.md.

export interface TaskResource {
  intent: string;
  videoId: string;
  title: string;
  channel: string;
  realMinutes: number;
  language?: 'en' | 'hi';
  /** Longer than a daily task block. We still link it — it is the best
   *  explanation available for that topic — but we say so, because the plan
   *  above it is asking for thirty minutes, not seventy-eight. */
  longForm?: true;
}

// A stable id linking one verdict to the reason that may follow it. Without
// this the reason would have to be a second resource_verdict, and every
// "not helpful" count would double.
function newVerdictId(): string {
  try {
    return globalThis.crypto?.randomUUID?.() ?? `v${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  } catch {
    return `v${Date.now()}${Math.random().toString(36).slice(2, 8)}`;
  }
}

// Why an intent maps to a verb: it names what the student is about to do. The
// intent itself is our vocabulary, not theirs.
const LEAD_IN: Record<string, string> = {
  concept: 'Learn it',
  worked_example: 'See it solved',
};

// Offered only after "not helpful". Recorded, never scored — the point is to
// find the broken and the mis-shelved, not to build a preference model out of
// six radio buttons.
const REASONS = [
  'Too basic',
  'Too hard',
  'Too long',
  'Not clear',
  "Couldn't open it",
  'Not what I needed',
] as const;

export function TaskResource({
  resource: primary,
  secondary,
  topic,
  taskId,
}: {
  resource: TaskResource;
  /** The alternative explanation. Revealed only on a negative verdict. */
  secondary?: TaskResource | null;
  topic: string | null;
  taskId: string;
}) {
  // All feedback semantics live in lib/resource-feedback — one authority,
  // driven through whole journeys by a node test. This component renders it
  // and forwards the events it asks for; it decides nothing itself.
  const [state, commit] = useReducer(
    (st: FeedbackState, a: FeedbackAction) => reduceFeedback(st, a).state,
    initialFeedback,
  );
  // The resource actually on screen. One at a time, always.
  const onSecondary = state.onSecondary;
  const resource = onSecondary && secondary ? secondary : primary;

  const base = {
    topic,
    taskId,
    videoId: resource.videoId,
    intent: resource.intent,
    channel: resource.channel,
    rank: onSecondary ? 'secondary' : 'primary',
  };

  // Single emission point. The reducer says what a transition means; nothing
  // else in this file is allowed to call track() for feedback.
  //
  // Deliberately NOT called `dispatch`: that name belongs to the notification
  // dispatcher, and event-registry-completeness.guard.test.ts reads
  // `dispatch({ type: ... })` as a notification type needing an EVENT_POLICY
  // entry. This is a React reducer, not a notification.
  function advance(a: FeedbackAction) {
    // Computed from THIS render's committed state, which is what both the
    // effect and the handlers close over. No ref: writing one during render is
    // forbidden, and every transition here is one user action or one effect,
    // with a re-render between — and the reducer ignores repeats regardless.
    const { emit } = reduceFeedback(state, a);
    commit(a);
    for (const e of emit) track(e.event, { ...base, ...e.props });
  }

  // Announce the resource on screen. The reducer makes this exactly-once per
  // video, so a re-render is silent and a swap to the secondary is not.
  useEffect(() => {
    advance({ type: 'present', videoId: resource.videoId });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resource.videoId]);

  // We cannot see what happened on YouTube — no watch time, no completion.
  // These taps are the only honest outcome signal available.
  const ask = (v: Verdict) => advance({ type: 'verdict', verdict: v, verdictId: newVerdictId() });
  const reason = (r: string) => advance({ type: 'reason', reason: r });
  const tryOther = () => advance({ type: 'try_other' });

  const canOffer = canOfferSecondary(state, !!secondary);

  return (
    // Stops the tap from reaching the task row, which would tick the task.
    // Opening a resource is not progress; claiming it was would corrupt the
    // completion data the whole planner reads from.
    <div className="mt-2" onClick={(e) => e.stopPropagation()}>
      <a
        href={`https://www.youtube.com/watch?v=${resource.videoId}`}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => advance({ type: 'open' })}
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
            {/* Said before the tap, and only when it is not the default.
                Twenty-one of the live videos are taught in Hindi while
                YouTube's own language field claims otherwise, so a student
                could land on a Hindi lecture with no warning. Hindi is often
                the better lesson for our students; being surprised by it is
                the part that is not. */}
            {resource.language === 'hi' && ' · in Hindi'}
          </span>
          {/* The one sentence that keeps a 78-minute lecture from reading as a
              78-minute instruction. The task's target is unchanged and always
              was; this stops the ROW implying otherwise. */}
          {resource.longForm && (
            <span className="mt-0.5 block text-[11px] text-stone-400">
              Longer than today&rsquo;s block — you don&rsquo;t have to finish it today.
            </span>
          )}
        </span>
      </a>

      {/* Only after they have actually gone. Asking "did it help?" about a
          link nobody opened would manufacture an opinion out of nothing. */}
      {shouldAskVerdict(state) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] text-stone-500">Did that help?</span>
          {([['helped', 'Helpful'], ['okay', 'Okay'], ['did_not', 'Not helpful']] as const).map(
            ([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => ask(v)}
                className="rounded-full border border-stone-200 px-2.5 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
              >
                {label}
              </button>
            ),
          )}
        </div>
      )}

      {/* A student who never tapped is also telling us something — but about
          the row, not about the video. Kept separate so it can never be read
          as an opinion on content they did not see. */}
      {shouldOfferNotOpened(state) && (
        <button
          type="button"
          onClick={() => ask('not_opened')}
          className="mt-1 px-1 text-[10px] text-stone-400 underline underline-offset-2 hover:text-stone-600"
        >
          Not useful to me
        </button>
      )}

      {/* The whole point of a secondary: the student does not choose between
          four links, they are given one, and a better one only if the first
          missed. */}
      {canOffer && (
        <button
          type="button"
          onClick={tryOther}
          className="mt-1.5 rounded-full border border-stone-300 px-2.5 py-0.5 text-[11px] font-medium text-stone-700 hover:bg-stone-100"
        >
          Try another explanation →
        </button>
      )}

      {state.verdict === 'did_not' && !state.reasonGiven && (
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 px-1">
          <span className="text-[11px] text-stone-500">What went wrong?</span>
          {REASONS.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => reason(r)}
              className="rounded-full border border-stone-200 px-2 py-0.5 text-[10px] text-stone-600 hover:bg-stone-100"
            >
              {r}
            </button>
          ))}
        </div>
      )}

      {state.verdict !== null && state.verdict !== 'did_not' && (
        <p className="mt-1.5 px-1 text-[11px] text-stone-400">
          {state.verdict === 'helped' ? 'Good — noted.' : "Noted. We'll review this link."}
        </p>
      )}

      {/* Stays after a reason is given — the offer belongs to the verdict, not
          to whether they explained it. */}
      {state.verdict === 'did_not' && state.reasonGiven && !canOffer && (
        <p className="mt-1.5 px-1 text-[11px] text-stone-400">Noted. We&rsquo;ll review this link.</p>
      )}
    </div>
  );
}
