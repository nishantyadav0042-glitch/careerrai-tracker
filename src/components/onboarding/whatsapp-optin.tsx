'use client';

import { track } from '@/lib/journey';

// ── WhatsApp, weighted by how reachable the student actually is ─────────────
//
// Founder, 14 Aug: "the student who didn't install the app is DEAD to us —
// we cannot reach them any way at all, so they MUST see WhatsApp. Someone who
// installed can be asked after. Same for anyone who closed notifications —
// put WhatsApp on the very next screen, push everything else aside."
//
// That is the right model, and it is not a fixed position in the flow: the
// placement follows REACH. The measured picture behind it — students who
// signed up more than a week ago:
//
//   87% finish onboarding      — the sequence is not the problem
//   64% never log a single day
//   49% never return after day one
//   31% have a working push subscription
//
// So the students who skip install AND decline push are unreachable the
// moment the tab closes. Every one of them has a phone number. WhatsApp is
// the only channel left, and the founder's second point is the real prize:
// once they are in the group, a daily reminder can pull them back to install
// the app. Zero → one, even if it is never ten.
//
// THREE WEIGHTS, one screen:
//
//   unreachable  no app, no push → the strongest ask we make anywhere. The
//                skip is deliberately a sentence that names what they lose,
//                not a neutral "Not now" — but it IS still a skip. A hard
//                gate here would be the Incident #2 shape (requiring an
//                action to proceed took a whole cohort's logging to zero),
//                and a student who cannot get past a WhatsApp wall is more
//                lost than one who declines it.
//   partial      one channel works → normal ask.
//   reachable    app + push → light ask, easy out. They are already covered;
//                pushing hard here spends trust we do not need to spend.
//
// The promise is identical in all three: 2 messages a day, and the founder
// set the group to admins-only so our own members cannot break it.

export const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/LaH25FJ6W5E4tGRC0Z4gPE?s=cl&p=a&ilr=4';

export type Reach = 'unreachable' | 'partial' | 'reachable';

export function reachOf({ installed, pushOn }: { installed: boolean; pushOn: boolean }): Reach {
  if (installed && pushOn) return 'reachable';
  if (!installed && !pushOn) return 'unreachable';
  return 'partial';
}

const COPY: Record<Reach, { kicker: string; head: string; sub: string; skip: string }> = {
  unreachable: {
    kicker: 'Important',
    head: 'This is the only way we can reach you',
    sub: 'No app, no notifications. Your plan is ready every morning — but nothing will tell you.',
    skip: 'No thanks — I’ll remember on my own',
  },
  partial: {
    kicker: 'One last thing',
    head: 'Your plan, on WhatsApp',
    sub: 'So a reminder reaches you even when notifications don’t.',
    skip: 'Not now',
  },
  reachable: {
    kicker: 'Optional',
    head: 'Want your plan on WhatsApp too?',
    sub: 'Some students prefer it there. Your notifications already work.',
    skip: 'Skip',
  },
};

export function WhatsAppOptIn({ reach, onDone }: { reach: Reach; onDone: () => void }) {
  const c = COPY[reach];
  const urgent = reach === 'unreachable';

  return (
    <div className={`rounded-3xl px-5 py-6 ${urgent ? 'bg-[#0B2E1C] text-white' : 'bg-stone-900 text-white'}`}>
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[#25D366]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#052613" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.2 1.3-1.7 1.3-.4 0-1 .1-3.3-.9-2.8-1.2-4.5-4.1-4.7-4.3-.1-.2-1-1.4-1-2.6 0-1.3.7-1.9.9-2.1.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.1.1.5-.1 1Z" />
        </svg>
      </div>

      <p className={`text-[10px] font-bold uppercase tracking-widest ${urgent ? 'text-[#25D366]' : 'text-stone-400'}`}>
        {c.kicker}
      </p>
      <h2 className="mt-1 text-[23px] font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
        {c.head}
      </h2>
      <p className="mt-1.5 text-[13px] text-stone-400">{c.sub}</p>

      <div className="mt-5 space-y-3">
        <div className="flex items-start gap-3">
          <span className="w-[52px] shrink-0 pt-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#25D366]">7 AM</span>
          <span className="text-[13.5px] font-semibold">Today&apos;s study plan</span>
        </div>
        <div className="flex items-start gap-3">
          <span className="w-[52px] shrink-0 pt-0.5 text-[10px] font-extrabold uppercase tracking-wider text-[#25D366]">9 PM</span>
          <span className="text-[13.5px] font-semibold">Log what you studied</span>
        </div>
      </div>

      {/* The promise gets its own box because it IS the pitch. */}
      <div className="mt-5 rounded-xl border border-white/15 px-3.5 py-3">
        <p className="text-[15px] font-extrabold">2 messages a day. That&apos;s it.</p>
        <p className="mt-0.5 text-[12px] text-stone-400">No promotions. No group chatter. Leave anytime.</p>
      </div>

      <a
        href={WHATSAPP_GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        onClick={() => { track('whatsapp_join_click', { reach }); onDone(); }}
        className="mt-5 block w-full rounded-xl bg-[#25D366] py-3.5 text-center text-[15px] font-extrabold text-[#052613] active:scale-[0.99]"
      >
        Join on WhatsApp
      </a>
      <button
        type="button"
        onClick={() => { track('whatsapp_skip', { reach }); onDone(); }}
        className={`mt-1 block w-full py-3 text-stone-400 ${urgent ? 'text-[11.5px]' : 'text-[13px]'}`}
      >
        {c.skip}
      </button>
    </div>
  );
}
