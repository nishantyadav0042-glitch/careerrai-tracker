'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

// ── "Continue with Google" — STUDENT IDENTITY, and nothing else ─────────────
//
// This is a DIFFERENT OAuth purpose from the mentor's Google Calendar
// connection, and conflating the two is the mistake this comment exists to
// prevent:
//
//   · MENTOR calendar  → /api/google/connect → our own OAuth client, the
//     SENSITIVE scope calendar.events, a refresh token stored in
//     google_oauth_tokens, and a Meet room minted on their calendar.
//   · STUDENT identity → here → Supabase Auth's Google provider, identity
//     scopes ONLY, no refresh token of ours, no calendar access, nothing
//     stored by us but the session Supabase issues.
//
// A student signing in must never be asked for calendar permission. It would
// be a scarier consent screen than the product needs, it would drag every
// student into the sensitive-scope verification story, and it would give us
// access we have no use for.
//
// So: openid + email + profile, declared explicitly rather than left to the
// provider default, so an audit can read the scope list here rather than infer
// it. And deliberately NO access_type=offline — offline access is what asks
// Google for a refresh token, and identity sign-in has no business holding one.
//
// WHERE THE ACCOUNT COMES FROM. We create nothing here. The `on_auth_user_created`
// trigger on auth.users fires for every new auth user — Google included — and
// inserts the profile with the email and full_name Google supplies. /auth/callback
// then exchanges the PKCE code and routes them. That is the same path email
// sign-in already uses, so this button adds an entry point and not a second
// account-creation authority.
//
// DUPLICATES. Supabase links a Google identity to an existing user when the
// email matches and is confirmed, so an email-based account is reused rather
// than duplicated. A phone-OTP student with no email on file cannot be matched
// on anything — and guessing would be worse than a second account, so we let
// Supabase decide and never merge by hand.

const SCOPES = 'openid email profile';

function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-4 w-4" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.1 5.3-4.6 7l7.1 5.5c4.2-3.8 6.6-9.5 6.6-16z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C1 16.3 0 20 0 24s1 7.7 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.1-5.5c-2 1.4-4.6 2.2-8.8 2.2-6.3 0-11.7-3.7-13.6-9.2l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export function ContinueWithGoogle({
  label = 'Continue with Google', next,
}: {
  label?: string;
  /** Where to land after sign-in. Defaults to the callback's own routing. */
  next?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback${
        next ? `?next=${encodeURIComponent(next)}` : ''
      }`;
      const { error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          scopes: SCOPES,
          // Lets someone pick which Google account, rather than silently
          // reusing whichever one the browser happens to be signed into.
          queryParams: { prompt: 'select_account' },
        },
      });
      // On success the browser is already navigating to Google; only a
      // failure returns here in a state worth reporting.
      if (err) {
        // The honest failure. Supabase answers "Unsupported provider: provider
        // is not enabled" until the Google provider is switched on in the
        // dashboard, and a button that silently does nothing is how a config
        // gap gets mistaken for a broken product.
        const notEnabled = /provider is not enabled|unsupported provider/i.test(err.message);
        setError(notEnabled
          ? 'Google sign-in is not switched on yet — use your mobile number or password for now.'
          : 'Google sign-in could not start — try again, or use your mobile number.');
        setBusy(false);
      }
    } catch {
      setError('Connection issue — try again, or use your mobile number.');
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => void go()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-stone-300 bg-white py-3 text-sm font-bold text-stone-800 transition-colors hover:border-stone-900 disabled:opacity-60"
        style={{ minHeight: 48 }}
      >
        <GoogleMark /> {busy ? 'Opening Google…' : label}
      </button>
      {error && (
        <p className="mt-1.5 text-center text-[12px] font-medium text-amber-800">{error}</p>
      )}
    </div>
  );
}
