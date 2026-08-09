'use client';

import { useState } from 'react';
import { Video, Copy, Check } from 'lucide-react';

// The mentor's own room, shown to the mentor.
//
// This did not exist. `profiles.buddy_meet_url` was written by the booking flow
// and read by the booking flow, and the mentor whose room it is could not see
// it anywhere in the app — not on their profile, not in settings, nowhere.
//
// That is a strange thing to hide from the one person who has to be in the room
// on time. Shreya Bendigeri had two sessions booked against a working link and
// both expired with nobody joining; she had no way to check the room, test it
// in advance, or paste it to a student who said "which link?".
//
// One room, reused for every session she ever books, so the link a student
// saved three weeks ago still works.

export function MeetingRoomCard({ meetUrl }: { meetUrl: string | null }) {
  const [copied, setCopied] = useState(false);

  function copy() {
    if (!meetUrl) return;
    navigator.clipboard?.writeText(meetUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4 space-y-3">
      <div className="flex items-center gap-2">
        <Video className="h-4 w-4 text-teal-700" />
        <h3 className="text-sm font-bold text-stone-900">Your meeting room</h3>
      </div>

      {meetUrl ? (
        <>
          <p className="text-xs leading-relaxed text-stone-500">
            Every session you book uses this same link — students who saved it once never
            need a new one.
          </p>

          <div className="flex items-center gap-2 rounded-xl bg-stone-50 px-3 py-2.5">
            <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-stone-700">
              {meetUrl.replace('https://', '')}
            </span>
            <button
              type="button"
              onClick={copy}
              aria-label="Copy your meeting link"
              className="shrink-0 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-bold text-white active:scale-[0.98]"
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>

          <div className="flex items-center gap-2">
            <a
              href={meetUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 rounded-xl border border-stone-300 py-2 text-center text-xs font-semibold text-stone-700 hover:border-stone-900 hover:text-stone-900"
            >
              Test the room
            </a>
          </div>

          {/* The one thing a mentor needs to know about a permanent room: it is
              permanent. A mentor who assumes each booking mints a fresh link
              will not think to check this one still works. */}
          <p className="text-[11px] leading-relaxed text-stone-400">
            Sent to your student automatically the moment you schedule a session, and again
            the day before. To change it, message the team.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs leading-relaxed text-amber-700">
            You have no meeting room set yet — <b>you cannot book a session until you do.</b>
          </p>
          <p className="text-[11px] leading-relaxed text-stone-400">
            Send the team your Google Meet or Zoom link and we will set it up. It stays the
            same for every session you ever run.
          </p>
        </>
      )}
    </div>
  );
}
