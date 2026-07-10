'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Lock, X } from 'lucide-react';

// The set-password ask, moved OUT of the first-login flow (founder call:
// a password wall right after signup is friction exactly when a new
// student's motivation is most fragile — OTP login works fine without
// one). From day 2 this small dismissible card offers it as what it
// really is: a convenience. Dismissal persists via the merge-safe
// notif_prefs PATCH, so it never nags twice; setting the password stamps
// password_set and the server stops rendering it entirely.
export function SetPasswordReminder({ notifPrefs }: { notifPrefs: Record<string, unknown> }) {
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;

  function dismiss() {
    setHidden(true);
    fetch('/api/profiles/notif-prefs', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...notifPrefs, password_prompt_dismissed: true }),
    }).catch(() => {});
  }

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-white px-4 py-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-stone-100">
        <Lock className="h-4 w-4 text-stone-600" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-stone-900">Set a password for faster login</p>
        <p className="text-xs text-stone-500">Skip the OTP next time — 20 seconds.</p>
      </div>
      <Link
        href="/set-password?dest=/student/tracker"
        className="shrink-0 rounded-xl bg-stone-900 px-3 py-2 text-xs font-semibold text-white hover:bg-stone-800"
      >
        Set now
      </Link>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 p-1 text-stone-400 hover:text-stone-600">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
