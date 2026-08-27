'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ── "CONTINUE WITH GOOGLE" ──────────────────────────────────────────────────
//
// Founder decision, 27 Aug: Google is a first-class way into CareerRai, beside
// phone OTP and password rather than instead of them. Nobody is forced through
// it, and it never appears anywhere near payment.
//
// A DIFFERENT GOOGLE FROM THE MENTOR ONE, and the distinction matters. The
// mentor's Connect Google (/api/google/connect) asks for Calendar permission
// on an account we already know, and lands on /api/google/callback. This is
// AUTHENTICATION: Supabase mints the session, so the round trip goes through
// Supabase's own callback and comes back to /auth/callback. Pointing this at
// the mentor route would authorise a calendar for a person we have not
// identified yet.
export function ContinueWithGoogle({ label = 'Continue with Google' }: { label?: string }) {
  const [going, setGoing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setGoing(true);
    setError(null);
    const { error: err } = await createClient().auth.signInWithOAuth({
      provider: 'google',
      options: {
        // Back to OUR callback, which is where the profile is created or
        // matched. window.location.origin keeps this correct on previews.
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    // Success navigates away, so reaching here at all means it did not start.
    if (err) {
      console.error('[continue-with-google]', err.message);
      setError('Google sign-in is unavailable right now. Use your phone number below.');
      setGoing(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={go}
        disabled={going}
        className="flex w-full items-center justify-center gap-2.5 rounded-xl border border-stone-300 bg-white py-3.5 text-sm font-bold text-stone-800 transition-colors hover:border-stone-900 disabled:opacity-60"
        style={{ minHeight: 48 }}
      >
        <GoogleMark />
        {going ? 'Opening Google…' : label}
      </button>
      {/* Never a dead end: the phone path is right below and always works. */}
      {error && <p className="mt-2 text-center text-[12px] text-amber-700">{error}</p>}
    </div>
  );
}

/** Google's four-colour G, inline so the button carries no network dependency. */
function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.3-.14-2.6-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.05 6.05 29.3 4 24 4 16.3 4 9.7 8.35 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.6 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.1-4.1 5.6l6.2 5.2C36.9 40.2 44 35 44 24c0-1.3-.14-2.6-.4-3.5z" />
    </svg>
  );
}
