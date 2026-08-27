'use client';

import { useState } from 'react';
import { Check, Loader2 } from 'lucide-react';

// ── ONE BUTTON, NOT A DECISION ──────────────────────────────────────────────
//
// Founder decision, 27 Aug. This replaces MeetingRoomSetup, which asked the
// mentor to choose: paste a Meet/Zoom/Teams link, OR connect Google. Both
// worked, which was the problem — a setup screen with two right answers is one
// a lot of people simply do not finish, and nine mentors in production proved
// it: two had pasted a room, none had ever connected Google, and the rest had
// neither.
//
// So there is no choice here any more. CareerRai runs the meeting on the
// mentor's Google account — Calendar holds the event, Meet provides the link,
// and the reminders hang off both. A pasted URL could never do those last two,
// which is why it stopped being an equal option rather than being demoted.
//
// NOTHING BELOW NAMES AN IMPLEMENTATION DETAIL. No buddy_meet_url, no event
// ids, no tokens, no "room minting", no OAuth. The mentor is being asked for
// one thing they already understand: connect your Google Calendar.
export function GoogleConnectCard({
  connected,
  email,
  from = '/buddy/home',
  googleStatus,
}: {
  connected: boolean;
  /** Which Google account is connected, when we know it. Shown, never asked for. */
  email?: string | null;
  /** Where Google should return them — the screen they started on. */
  from?: string;
  /** ?google= after a round trip: connected | denied | failed | unavailable */
  googleStatus?: string | null;
}) {
  const [going, setGoing] = useState(false);

  if (connected) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600">
            <Check className="h-3 w-3 text-white" strokeWidth={3} />
          </span>
          <p className="text-[15px] font-extrabold text-emerald-900">Google Connected</p>
        </div>
        <p className="mt-1 text-[12.5px] text-emerald-800">
          {email
            ? <>Sessions, meeting links and reminders run through <b>{email}</b>.</>
            : <>Sessions, meeting links and reminders run through your Google Calendar.</>}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[15px] font-extrabold text-stone-900">Connect Google</p>
      <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
        Connect your Google Calendar to schedule sessions, create Google Meet links,
        and manage session reminders.
      </p>

      <a
        href={`/api/google/connect?from=${encodeURIComponent(from)}`}
        onClick={() => setGoing(true)}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-stone-900 py-2.5 text-[13px] font-bold text-white"
      >
        {going ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleMark />}
        {going ? 'Opening Google…' : 'Connect Google'}
      </a>

      {/* Only states the mentor can act on, or that tell them it is not their
          fault. Anything else would be us explaining our own plumbing. */}
      {googleStatus === 'denied' && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">
          Google did not finish connecting. Nothing was saved — try again above.
        </p>
      )}
      {(googleStatus === 'failed' || googleStatus === 'unavailable') && (
        <p className="mt-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[12px] text-amber-900">
          We could not reach Google just now. This is on our side, not yours — our
          team has been told. Please try again shortly.
        </p>
      )}
    </div>
  );
}

/** Google's four-colour G. Inline so the card carries no network dependency. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.14-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 16.3 4 9.7 8.35 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.14-2.6-.4-3.5z" />
    </svg>
  );
}
