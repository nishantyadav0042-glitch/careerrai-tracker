'use client';

import { useState } from 'react';
import { Calendar, Check, AlertTriangle } from 'lucide-react';

// The mentor-side Google gate (founder, 5 Aug). Sessions now run on Google
// Meet, and a Meet link can only be minted on a real Google calendar — so a
// mentor connects once, and from then on every booking creates a proper
// calendar event with a Meet link and reminders.
//
// Written for the audience: IIM alumni with day jobs. One button, one
// sentence about what it does, no explanation of OAuth. When it's connected
// it collapses to a single quiet line — a connected integration should get
// out of the way, not congratulate itself forever.
export function GoogleConnectCard({
  connected, email, from = '/buddy/schedule', status,
}: {
  connected: boolean;
  email: string | null;
  from?: string;
  /** ?google= value after the round trip: connected | denied | failed */
  status?: string | null;
}) {
  const [busy, setBusy] = useState(false);

  if (connected) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2">
        <Check className="h-4 w-4 shrink-0 text-teal-700" />
        <p className="min-w-0 flex-1 truncate text-[13px] text-teal-900">
          Google Calendar connected{email ? ` · ${email}` : ''}
        </p>
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            await fetch('/api/google/disconnect', { method: 'POST' }).catch(() => {});
            location.reload();
          }}
          disabled={busy}
          className="shrink-0 text-[11px] font-semibold text-teal-700 underline underline-offset-2 disabled:opacity-50"
        >
          Disconnect
        </button>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
          <Calendar className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900">One step before you can book</p>
          {/* Says what actually happens now. The permanent-room design stopped
              creating a calendar event per booking, so promising that would be
              a lie the mentor discovers on their first session. */}
          <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">
            Connect once and you get your own permanent Meet room. Every session you
            ever book uses that same link — you never create or share a new one, and
            a link you&apos;ve already sent a student never stops working.
          </p>

          {status === 'denied' && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-orange-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {/* This fires both when someone presses Cancel AND when Google
                  refuses outright — so it must not accuse them of cancelling.
                  If Google said "this app is being tested", that account has to
                  be added as a test user; nothing they do on this screen helps. */}
              Google didn&apos;t complete the connection. If it said the app is still
              being tested or unverified, that Google account needs to be added as a
              tester — tell the team which address you used.
            </p>
          )}
          {status === 'failed' && (
            <p className="mt-2 flex items-start gap-1.5 text-[12px] font-medium text-orange-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Google didn&apos;t complete the connection. If you&apos;ve connected before, remove
              CareerRai in your Google account permissions and try once more.
            </p>
          )}

          <a
            href={`/api/google/connect?from=${encodeURIComponent(from)}`}
            className="mt-3 inline-flex items-center justify-center rounded-xl bg-stone-900 px-4 py-2.5 text-[13px] font-bold text-white"
          >
            Connect Google Calendar
          </a>
          <p className="mt-2 text-[11px] text-stone-500">
            We only create and update your CareerRai sessions. We never read your other events.
          </p>
        </div>
      </div>
    </section>
  );
}
