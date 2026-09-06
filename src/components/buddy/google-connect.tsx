'use client';

import { useState } from 'react';
import { Calendar, Check, AlertTriangle, ChevronRight } from 'lucide-react';

// ── ONE mentor setup path: Connect Google ───────────────────────────────────
//
// This replaces MeetingRoomSetup, which asked a mentor to choose between
// pasting a meeting-room URL and connecting Google, and MeetingRoomCard, which
// showed them the URL afterwards. Two visible ways to configure the same thing
// is a decision we were making the mentor take on our behalf, and the screen
// that resulted — "Set your meeting room to start booking", a paste box, a
// Save button, and a grey "Or connect Google to make one for me" underneath —
// is the complexity the founder removed on 27 Aug.
//
// A mentor now has exactly two things to understand:
//   1. Connect Google
//   2. Set your availability
// and the second lives in SessionReadiness, deliberately not merged into here.
//
// buddy_meet_url, buddy_meet_event_id, OAuth tokens and calendar events are
// implementation details. None of them appear on this screen.
//
// THE STATE COMES FROM THE SERVER, NOT FROM THE REDIRECT. `googleStatus` is
// only the toast for the round trip just completed; what the card actually
// renders is decided by `googleConnected` and `hasRoom`, both read live by
// buddyBookingReadiness (tokens from google_oauth_tokens, not the dead
// profiles.google_calendar_connected column). That distinction is the whole
// point of state B below.

export function GoogleConnect({
  googleConnected, hasRoom, googleEmail, from = '/buddy/home', googleStatus,
}: {
  googleConnected: boolean;
  /** A usable meeting room exists. Google mints one at connect time. */
  hasRoom: boolean;
  googleEmail: string | null;
  from?: string;
  /** ?google= after a round trip: connected | denied | failed | unavailable */
  googleStatus?: string | null;
}) {
  const connectHref = `/api/google/connect?from=${encodeURIComponent(from)}`;

  // ── WHY THIS IS NESTED RATHER THAN `googleConnected && hasRoom` ───────────
  //
  // bookability-authority.test.ts sweeps the repo for a room check conjoined
  // with a Google check on one line, because SEVEN surfaces once computed
  // "can this mentor be booked" that way and gave four different answers. It
  // flagged the flat version of this file, and it was right to: the shape is
  // indistinguishable from a bookability rule.
  //
  // This card does not decide bookability — decideBookability() does, and
  // buddyBookingReadiness() is what the pages call. All this picks is WHICH OF
  // THREE SETUP STATES to draw. Nesting says that structurally: first "is
  // Google connected", then, inside that, "did it produce a room". Do not
  // flatten it back into one condition.
  if (googleConnected) {
    // Connected, and the room exists. Nothing left to do here.
    if (hasRoom) {
      return (
      <div className="flex items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3 py-2.5">
        <Check className="h-4 w-4 shrink-0 text-teal-700" />
        <div className="min-w-0 flex-1">
          <p className="text-[12.5px] font-semibold text-teal-900">Google Connected ✓</p>
          {googleEmail && (
            <p className="truncate text-[11.5px] text-teal-800">{googleEmail}</p>
          )}
        </div>
        </div>
      );
    }

    // ── THE HONEST FAILURE STATE ────────────────────────────────────────────
    //
    // Google authorisation succeeded — the token is stored — but the meeting
    // room was not created. The callback logged that and still redirected
    // ?google=connected, so before this state existed the mentor was told
    // "connected" while remaining unbookable, with no way to act on it.
    //
    // Never claims readiness it cannot back, and never dead-ends: reconnecting
    // runs ensureBuddyRoom again, which is the actual recovery.
    return (
      <section className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-amber-500">
            <AlertTriangle className="h-4 w-4 text-white" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-stone-900">
              Google is connected, but your meeting link isn&apos;t ready yet
            </p>
            <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">
              Your Google account is linked{googleEmail ? ` (${googleEmail})` : ''}, but we
              could not finish setting up the room your sessions run in — so students
              cannot book you yet. Connecting again usually fixes it.
            </p>
            <a
              href={connectHref}
              className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-3 text-[13px] font-bold text-white"
              style={{ minHeight: 48 }}
            >
              Try connecting again <ChevronRight className="h-3.5 w-3.5" />
            </a>
            <p className="mt-2 text-[11.5px] leading-relaxed text-stone-500">
              Still stuck after a second try? Message the team — this one is on us, not you.
            </p>
          </div>
        </div>
      </section>
    );
  }

  // ── Not connected. The single, obvious setup action. ──────────────────────
  return (
    <section className="rounded-2xl border-2 border-orange-300 bg-orange-50 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-orange-500">
          <Calendar className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">Connect Google Calendar</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">
            Connect your Google Calendar to schedule sessions, create Google Meet links,
            and receive calendar and reminder support.
          </p>

          {googleStatus === 'unavailable' && (
            <p className="mt-2.5 rounded-lg bg-amber-100 px-2.5 py-2 text-[12px] font-medium text-amber-900">
              Google connect isn&apos;t switched on for the app yet — that&apos;s an admin
              job on our side, nothing you did. We&apos;re on it.
            </p>
          )}
          {googleStatus === 'denied' && (
            <p className="mt-2.5 rounded-lg bg-amber-100 px-2.5 py-2 text-[12px] font-medium text-amber-900">
              Google didn&apos;t finish connecting — the permission screen was closed or
              declined. Tap Connect Google to try again.
            </p>
          )}
          {googleStatus === 'failed' && (
            <p className="mt-2.5 rounded-lg bg-amber-100 px-2.5 py-2 text-[12px] font-medium text-amber-900">
              Google refused the connection. This is usually a configuration problem on
              our side, not yours — tell the team if a second try doesn&apos;t work.
            </p>
          )}

          <a
            href={connectHref}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 px-4 py-3 text-[13px] font-bold text-white"
            style={{ minHeight: 48 }}
          >
            Connect Google <ChevronRight className="h-3.5 w-3.5" />
          </a>

          {/* ── THE SECOND PATH (restored 5 Sep 2026) ──────────────────────
              Google shows a red "hasn't verified this app" screen until our
              OAuth app clears verification, and a mentor who declines it —
              which that screen is telling her to do — was left with no way to
              take bookings at all. Deliberately placed BELOW Google and styled
              quieter: Google is still the better path when it works, and the
              27 Aug note was right that two equal-looking answers is a setup
              question people abandon. This is a way through, not a fork. */}
          <RoomFallback />
        </div>
      </div>
    </section>
  );
}

/** Paste-your-own-room, for a mentor blocked by Google's verification screen. */
function RoomFallback() {
  const [open, setOpen] = useState(false);
  const [link, setLink] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-2.5 w-full text-[12px] font-semibold text-stone-600 underline underline-offset-2"
      >
        Can&apos;t connect Google? Use your own meeting link instead
      </button>
    );
  }

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/buddy/meeting-room', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ link }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        // Show the server's own message — it names the exact problem with the
        // link (wrong host, a meet.google.com/new that dies on arrival).
        setError(typeof data?.error === 'string' ? data.error : 'Could not save. Try again.');
        return;
      }
      window.location.reload();
    } catch {
      setError('Could not save. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-3 rounded-xl border border-stone-300 bg-white p-3">
      <p className="text-[12.5px] font-semibold text-stone-900">Use your own meeting link</p>
      <p className="mt-0.5 text-[11.5px] leading-relaxed text-stone-600">
        Paste a Google Meet, Zoom or Teams link you have already created. Students will
        join this room. You will not get automatic calendar invites or reminders — connect
        Google later for those.
      </p>
      <input
        type="url"
        inputMode="url"
        value={link}
        onChange={(e) => setLink(e.target.value)}
        placeholder="meet.google.com/abc-defg-hij"
        aria-label="Your meeting link"
        className="mt-2 w-full rounded-lg border border-stone-300 px-3 py-2.5 text-[13px]"
        style={{ minHeight: 44 }}
      />
      {error && (
        <p className="mt-2 rounded-lg bg-amber-100 px-2.5 py-2 text-[12px] font-medium text-amber-900">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={save}
        disabled={busy || link.trim() === ''}
        className="mt-2.5 flex w-full items-center justify-center rounded-xl bg-stone-900 px-4 py-3 text-[13px] font-bold text-white disabled:opacity-50"
        style={{ minHeight: 48 }}
      >
        {busy ? 'Saving…' : 'Save meeting link'}
      </button>
    </div>
  );
}
