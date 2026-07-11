'use client';

import { useEffect, useState } from 'react';
import { Share, Plus, ChevronDown } from 'lucide-react';

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
    <div className="relative flex min-h-[100dvh] flex-col items-center bg-white px-6 pb-28 pt-10 text-center">
      <div className="mx-auto flex w-full max-w-xs flex-1 flex-col items-center justify-center gap-5">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-stone-900 text-3xl shadow-lg shadow-stone-900/15">📲</div>
        <div>
          <h1 className="text-2xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Add CareerRai to your Home&nbsp;Screen</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            <span className="font-semibold text-stone-700">Just 3&nbsp;MB.</span> Opens like a real app, and it&apos;s the only way your daily reminders reach you{ios ? ' on iPhone' : ''}. You&apos;ll be <span className="font-semibold text-stone-700">signed in automatically.</span>
          </p>
        </div>

        {ios ? (
          <div className="w-full space-y-2.5 text-left">
            <Step n={1}>
              <>Tap the <span className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-blue-50 px-1.5 py-0.5 align-middle font-semibold text-blue-700"><Share className="h-3.5 w-3.5" />Share</span> button in Safari&apos;s bar.</>
            </Step>
            <Step n={2}>
              <>Scroll down, tap <span className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 align-middle font-semibold text-stone-800"><Plus className="h-3.5 w-3.5" />Add to Home Screen</span>.</>
            </Step>
            <Step n={3}><>Tap <b>Add</b> — then open CareerRai from your Home Screen. Done.</></Step>
            <p className="pl-9 pt-0.5 text-[11px] text-stone-400">Works in <b>Safari</b> only. In Chrome? Open this page in Safari first.</p>
          </div>
        ) : (
          <div className="w-full space-y-2.5 text-left">
            <Step n={1}><>Open your browser menu (<b>⋮</b>, top-right).</></Step>
            <Step n={2}><>Tap <b>Install app</b> or <b>Add to Home screen</b>.</></Step>
            <Step n={3}><>Confirm — CareerRai installs like a normal app.</></Step>
          </div>
        )}
      </div>

      {/* The "do it now" cue: a pulsing arrow pointing at Safari's Share button
          (bottom toolbar on iPhone). This is what makes it feel guided rather
          than a wall of text. */}
      {ios && (
        <div className="pointer-events-none fixed inset-x-0 bottom-3 z-10 flex flex-col items-center gap-1">
          <div className="flex items-center gap-1.5 rounded-full bg-stone-900 px-3.5 py-1.5 text-xs font-semibold text-white shadow-lg shadow-stone-900/25">
            Tap <Share className="h-3.5 w-3.5" /> Share down here
          </div>
          <ChevronDown className="h-7 w-7 animate-bounce text-stone-900" strokeWidth={2.5} />
        </div>
      )}
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
