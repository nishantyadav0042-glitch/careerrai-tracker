'use client';

import { useEffect, useState } from 'react';
import { MessageCircle, ArrowRight, Check } from 'lucide-react';
import { track } from '@/lib/journey';
import { TOUR_DONE_EVENT, tourDone, notifAskVisible, insightVisible, logModalOpen } from '@/lib/first-run-events';

// The reach gate.
//
// Only 65 of 246 students can receive a push notification — 26%. The other 181
// are unreachable by anything the app controls, and 80 of them have been cold
// for two weeks. A broadcast channel is the one route that reaches nearly
// everyone, so this asks every student to join it: not just new signups, which
// is why it lives here as a gate rather than as a step in the signup sequence.
// Placed in the signup flow it would have missed all 246 students who already
// exist — the exact people this is for.
//
// It waits for the first-run sequence to finish, like CoverageReviewGate, so a
// brand-new student is never hit with this on top of their tour. It does not
// claim the once-a-day optional-modal slot, because it is asked once and then
// never again.
//
// "Mandatory" here means insistent, not inescapable: there is no Close button,
// but "I've already joined" is always available. A student who taps that is
// recorded as joined and never asked again. We cannot verify it either way —
// WhatsApp Channels report a follower count and never a member list — so the
// honest design is to ask clearly, record what they say, and label the number
// as self-reported everywhere it is shown.

interface Status {
  ask: boolean;
  channel?: string;
  url?: string;
}

export function ChannelJoinGate() {
  const [status, setStatus] = useState<Status | null>(null);
  const [show, setShow] = useState(false);
  const [done, setDone] = useState(false);
  const [clicked, setClicked] = useState(false);

  // Ask the server whether this student still needs the prompt.
  useEffect(() => {
    let alive = true;
    fetch('/api/student/channel')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: Status | null) => { if (alive && d) setStatus(d); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  // Wait for the first-run sequence to be out of the way.
  useEffect(() => {
    if (!status?.ask || !status.url || done) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let shown = false;

    const attempt = () => {
      if (shown) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        if (shown || !tourDone() || notifAskVisible() || insightVisible() || logModalOpen()) return;
        shown = true;
        setShow(true);
        track('channel_prompt_shown', { channel: status.channel });
        void post('prompted');
      }, 1400);
    };

    attempt();
    window.addEventListener(TOUR_DONE_EVENT, attempt);
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener(TOUR_DONE_EVENT, attempt);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, done]);

  async function post(action: 'prompted' | 'clicked' | 'joined' | 'dismissed') {
    try {
      await fetch('/api/student/channel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel: status?.channel ?? 'whatsapp', action, source: 'gate' }),
      });
    } catch { /* bookkeeping must never block the student */ }
  }

  if (!show || done || !status?.url) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-stone-900/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[#25D366]">
          <MessageCircle className="h-7 w-7 text-white" />
        </div>

        <h2 className="mt-4 text-center text-xl font-bold text-stone-900">
          Join the CareerRai channel
        </h2>
        <p className="mt-2 text-center text-sm leading-relaxed text-stone-600">
          One place for the day&apos;s tip, the day&apos;s question, and a nudge to log your
          study. A few messages a day — nothing else, ever.
        </p>

        <ul className="mt-4 space-y-1.5 text-[13px] text-stone-600">
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />Today&apos;s student tip</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />A reminder to fill your log</li>
          <li className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-teal-600" />No forwards, no spam, no group chat</li>
        </ul>

        <a
          href={status.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            setClicked(true);
            track('channel_join_click', { channel: status.channel });
            void post('clicked');
          }}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] py-3.5 text-sm font-bold text-white active:scale-[0.98]"
        >
          Join the channel <ArrowRight className="h-4 w-4" />
        </a>

        <button
          type="button"
          onClick={() => {
            track('channel_joined', { channel: status.channel, afterClick: clicked });
            void post('joined');
            setDone(true);
            setShow(false);
          }}
          className="mt-2.5 w-full rounded-2xl border border-stone-200 py-3 text-sm font-semibold text-stone-600 active:scale-[0.98]"
        >
          {clicked ? "Done — I've joined" : "I've already joined"}
        </button>
      </div>
    </div>
  );
}
