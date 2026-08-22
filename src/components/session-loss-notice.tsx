'use client';

import { useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { consumeLogoutIntent, shouldShowSessionLoss } from '@/lib/logout-intent';

// ── When the browser throws the session away by itself ──────────────────────
//
// The 22 Aug forensic found the logout happens in the BROWSER, not on our
// servers. auth-js's getSession() calls _removeSession() whenever the stored
// session fails _isValidSession, and _removeSession deletes every sb-* cookie
// through document.cookie — cookies Supabase writes with httpOnly:false, so
// client JS can remove them. user_role survives because it IS httpOnly. Our
// server never emits the deletion, which is why the [auth-cookie-removal]
// instrumentation never once fired while students were being logged out.
//
// VERIFIED, not assumed (the reason this component is allowed to exist):
// _removeSession ends with `_notifyAllSubscribers('SIGNED_OUT', null)`, so the
// exact production path does reach a listener. Before today the app had none —
// nothing noticed, nothing recovered, and the student simply found themselves
// at /login with no explanation.
//
// What this deliberately does NOT do: log the student back in, refresh, or
// redirect. The session is genuinely gone from this browser and only a real
// sign-in can restore it. Auto-navigating would risk the redirect loop that is
// far worse than the original bug. It explains, and it offers one door.
//
// STILL UNRESOLVED (do not read this component as a full fix): WHY the stored
// session becomes invalid. A partially-read chunked cookie is the leading
// inference and is not proven.

export function SessionLossNotice() {
  const [lost, setLost] = useState(false);
  // One notice per page life. SIGNED_OUT can arrive more than once (a retry
  // storm, several components racing) and a message that reappears reads as
  // the app breaking repeatedly.
  const shown = useRef(false);

  useEffect(() => {
    const supabase = createClient();
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      // INITIAL_SESSION fires on subscribe and TOKEN_REFRESHED on every healthy
      // rotation. Neither is a loss; reacting to them would show the notice to
      // students whose session is working perfectly.
      // Only consume the intent mark once we know this is a sign-out, so a
      // TOKEN_REFRESHED cannot silently burn a mark the real logout needs.
      const wasIntentional = event === 'SIGNED_OUT' ? consumeLogoutIntent(Date.now()) : false;
      if (!shouldShowSessionLoss({ event, alreadyShown: shown.current, wasIntentional })) return;
      shown.current = true;
      setLost(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!lost) return null;

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="session-loss-title"
      className="fixed inset-0 z-[100] grid place-items-center bg-stone-900/40 px-6"
    >
      <div className="w-full max-w-sm rounded-2xl border border-stone-200 bg-white p-5 text-center shadow-xl">
        <p id="session-loss-title" className="text-[15px] font-bold text-stone-900">
          You&apos;ve been signed out
        </p>
        {/* No Supabase error, no status code, no token state — a student is
            owed an explanation, not our internals. */}
        <p className="mt-1.5 text-[13px] leading-snug text-stone-600">
          This browser lost your sign-in. Nothing you saved is affected — signing
          in again will bring everything back exactly as it was.
        </p>
        <a
          href="/login"
          className="mt-4 inline-block rounded-xl bg-stone-900 px-5 py-2.5 text-[13.5px] font-bold text-white"
        >
          Sign in again
        </a>
      </div>
    </div>
  );
}
