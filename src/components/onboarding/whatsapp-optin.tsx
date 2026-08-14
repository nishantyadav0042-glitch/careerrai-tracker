'use client';

import { track } from '@/lib/journey';

// ── The last screen before Home: two messages a day, on WhatsApp ────────────
//
// Measured 14 Aug, on students who signed up more than a week ago:
//
//   87% finish onboarding          — onboarding is NOT the problem
//   64% never log a single day
//   49% never return after day one
//   31% have working push notifications
//
// Two-thirds of students are unreachable the moment they close the app, and
// every one of them has a phone number on file. So this screen exists to fix
// REACH, not onboarding — WhatsApp is the only channel that covers the 69%
// push cannot.
//
// It sits at the end of the sequence for two reasons: it is the point of peak
// commitment (they have just built a 46-topic plan and practised logging), and
// it is the last controlled moment before the drop. Asking at signup would tax
// a funnel that already converts 87%, for a student with no reason yet to say
// yes.
//
// THE PROMISE IS THE PITCH. "2 messages a day" converts where "join our
// community" does not: every CAT aspirant is already in a dozen dead groups,
// so the scarcity of our messaging is the reason to trust this one. The
// founder confirmed the group is set to admins-only before this shipped —
// without that, our own members would break the promise the moment 300
// students started chatting, and the promise sits on screen beside the button.
//
// Skippable, always. Nothing here gates Home.

export const WHATSAPP_GROUP_URL = 'https://chat.whatsapp.com/LaH25FJ6W5E4tGRC0Z4gPE?s=cl&p=a&ilr=4';

export function WhatsAppOptIn({ onDone }: { onDone: () => void }) {
  return (
    <div className="rounded-3xl bg-stone-900 px-5 py-6 text-white">
      <div className="mb-4 grid h-11 w-11 place-items-center rounded-xl bg-[#25D366]">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="#052613" aria-hidden="true">
          <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5.1-1.3A10 10 0 1 0 12 2Zm5.8 14.2c-.2.7-1.2 1.3-1.7 1.3-.4 0-1 .1-3.3-.9-2.8-1.2-4.5-4.1-4.7-4.3-.1-.2-1-1.4-1-2.6 0-1.3.7-1.9.9-2.1.2-.3.5-.3.7-.3h.5c.2 0 .4 0 .6.5l.8 2c.1.2.1.4 0 .5l-.3.5-.4.4c-.1.1-.3.3-.1.6.2.3.8 1.3 1.7 2.1 1.1 1 2 1.3 2.3 1.4.3.1.4.1.6-.1l.8-1c.2-.2.4-.2.6-.1l2 .9c.2.1.4.2.4.3.1.1.1.5-.1 1Z" />
        </svg>
      </div>

      <h2 className="text-[23px] font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
        Your plan, on WhatsApp
      </h2>
      <p className="mt-1.5 text-[13px] text-stone-400">
        So a reminder reaches you even when notifications don&apos;t.
      </p>

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
        onClick={() => { track('whatsapp_join_click', {}); onDone(); }}
        className="mt-5 block w-full rounded-xl bg-[#25D366] py-3.5 text-center text-[15px] font-extrabold text-[#052613] active:scale-[0.99]"
      >
        Join on WhatsApp
      </a>
      <button
        type="button"
        onClick={() => { track('whatsapp_skip', {}); onDone(); }}
        className="mt-1 block w-full py-3 text-[13px] text-stone-400"
      >
        Not now
      </button>
    </div>
  );
}
