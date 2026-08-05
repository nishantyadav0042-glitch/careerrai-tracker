'use client';

import { useState } from 'react';
import { CalendarPlus, Check } from 'lucide-react';

// The STUDENT side of the Google connection — deliberately optional.
//
// A mentor must connect (the Meet is minted on their calendar). A student
// never has to: they always get the join link in-app and by push. Connecting
// only adds the calendar invite and Google's own reminders.
//
// That asymmetry is a real product decision, not laziness. Both of our paying
// students signed up with a PHONE and have no email at all — gating them on a
// Google account would have blocked the very sessions we sell. So this card
// sells a benefit and can always be ignored.
//
// It hides itself entirely once connected + no student has a mentor yet — a
// prompt with nothing behind it is just noise.
export function StudentGoogleConnect({
  connected, email, status,
}: {
  connected: boolean;
  email: string | null;
  /** ?google= after the round trip: connected | denied | failed */
  status?: string | null;
}) {
  const [dismissed, setDismissed] = useState(false);

  if (connected) {
    return (
      <div className="mb-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2">
        <Check className="h-4 w-4 shrink-0 text-emerald-700" />
        <p className="min-w-0 flex-1 truncate text-[12.5px] text-emerald-900">
          Sessions go to your Google Calendar{email ? ` · ${email}` : ''}
        </p>
      </div>
    );
  }

  if (dismissed) return null;

  return (
    <section className="mb-3 rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-stone-900">
          <CalendarPlus className="h-4 w-4 text-white" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-stone-900">Get your sessions in your calendar</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-stone-600">
            Connect Google and every session with your buddy lands in your calendar
            with a reminder — so a call never slips because you forgot the time.
          </p>

          {status === 'denied' && (
            <p className="mt-2 text-[12px] font-medium text-stone-600">
              No problem — you cancelled at Google. Your sessions still show up here as usual.
            </p>
          )}
          {status === 'failed' && (
            <p className="mt-2 text-[12px] font-medium text-stone-600">
              That didn&apos;t go through. You can try again, or ignore this — your session
              link always appears here either way.
            </p>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <a
              href="/api/google/connect?from=%2Fstudent%2Fbuddy"
              className="inline-flex items-center justify-center rounded-xl bg-stone-900 px-4 py-2.5 text-[13px] font-bold text-white"
            >
              Connect Google
            </a>
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-xl px-3 py-2.5 text-[13px] font-semibold text-stone-500"
            >
              Not now
            </button>
          </div>
          <p className="mt-2 text-[11px] text-stone-400">
            Optional. We only add your CareerRai sessions — we never read your other events.
          </p>
        </div>
      </div>
    </section>
  );
}
