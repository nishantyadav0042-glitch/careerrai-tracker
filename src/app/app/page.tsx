'use client';

import { useEffect, useState } from 'react';
import { Share, Plus } from 'lucide-react';

// The installed-PWA entry point. Two jobs, decided by display mode:
//  • Standalone (opened from the Home Screen): a one-time hand-off token in
//    the URL is exchanged for a real session, so an iPhone user who installed
//    the app lands logged in instead of on a cold login screen.
//  • Browser (Safari): this IS the "Add to Home Screen" guide. We DON'T
//    consume the token here — leaving it in the URL means A2HS saves it, so
//    the first launch of the installed app can auto-log-in.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}
function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function AppEntry() {
  const [state, setState] = useState<'checking' | 'exchanging' | 'guide' | 'error'>('checking');

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- entry routing must run client-side after mount */
    const token = new URLSearchParams(window.location.search).get('k');

    if (isStandalone()) {
      if (!token) { window.location.replace('/student/tracker'); return; }
      setState('exchanging');
      fetch('/api/install/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
        .then(async (res) => {
          const json = await res.json().catch(() => ({}));
          // On success go to the destination. On failure (e.g. a REPEAT launch
          // where the one-time token is already spent) fall to /student/tracker
          // and let the proxy decide: if the PWA already has a session from the
          // first launch it loads straight in; if not, the proxy sends /login.
          window.location.replace(res.ok && json.dest ? json.dest : '/student/tracker');
        })
        .catch(() => window.location.replace('/student/tracker'));
      return;
    }
    // In a normal browser tab → show the install guide.
    setState('guide');
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

  if (state === 'checking' || state === 'exchanging') {
    return (
      <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-3 bg-white px-6 text-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-stone-200 border-t-stone-900" />
        <p className="text-sm text-stone-500">{state === 'exchanging' ? 'Signing you in…' : 'Opening CareerRai…'}</p>
      </div>
    );
  }

  const ios = isIOS();
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-white px-6 py-10 text-center">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-3xl">📲</div>
      <div>
        <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Add CareerRai to your Home Screen</h1>
        <p className="mt-2 text-sm text-stone-500">~3&nbsp;MB · opens like a real app · it&apos;s how your daily reminders reach you{ios ? ' on iPhone' : ''}. You&apos;ll be signed in automatically.</p>
      </div>

      <div className="w-full max-w-xs space-y-2.5 text-left">
        {ios ? (
          <>
            <Step n={1}><>Tap the <Share className="mx-0.5 inline h-4 w-4 align-text-bottom text-blue-600" /> <b>Share</b> button in Safari&apos;s bottom bar.</></Step>
            <Step n={2}><>Scroll and tap <b>Add to Home Screen</b> <Plus className="mx-0.5 inline h-4 w-4 align-text-bottom" />.</></Step>
            <Step n={3}><>Tap <b>Add</b>, then open CareerRai from your Home Screen — you&apos;ll be logged in.</></Step>
            <p className="pl-9 text-[11px] text-stone-400">Only works in <b>Safari</b>. In Chrome? Open this page in Safari first.</p>
          </>
        ) : (
          <>
            <Step n={1}><>Open your browser menu (<b>⋮</b>, top-right).</></Step>
            <Step n={2}><>Tap <b>Install app</b> or <b>Add to Home screen</b>.</></Step>
            <Step n={3}><>Confirm — CareerRai installs like a normal app.</></Step>
          </>
        )}
      </div>
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">{n}</span>
      <p className="text-sm leading-snug text-stone-700">{children}</p>
    </div>
  );
}
