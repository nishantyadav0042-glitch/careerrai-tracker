'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, MessageCircle } from 'lucide-react';
import { supportWhatsappUrl } from '@/lib/whatsapp';
import { AndroidInstallGuide } from '@/components/install/android-install-guide';
import { InstallButton } from '@/components/install/install-button';
import { useInstall } from '@/lib/install/use-install';

// The installed-PWA entry point. Two jobs, decided by display mode:
//  • Standalone (opened from Home Screen): exchange the one-time hand-off token
//    for a real session, so the installed app lands logged in.
//  • Browser: the install route for THIS platform. Android sees the red-ring
//    Add-to-Home-Screen walkthrough (the same one the post-signup sequence
//    uses); iPhone sees the one black App Store button and nothing else — it
//    has a real native app, so a home-screen guide here would be a second,
//    worse way to install the same thing. We don't consume the token in the
//    Android case: leaving it in the URL means Add-to-Home-Screen saves it, so
//    the first launch auto-logs-in.
//
// Dead-end fix (founder, 23 Jul): a student landing here in a plain browser
// tab — nothing installed yet, or just re-visiting — had NO way to go back or
// move on; the only escape was an optional WhatsApp link. Real bug: OS
// install prompts don't always fire, and a student shouldn't be trapped on a
// guide screen. Added a Back and a "Continue without installing" path — the
// app still works in a browser tab, install is strongly encouraged, never mandatory.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}

export default function AppEntry() {
  const [state, setState] = useState<'checking' | 'exchanging' | 'guide'>('checking');
  // One source of truth for "which install route is this device on".
  const { ui } = useInstall();
  const isIphone = ui === 'ios-app-store';

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect -- entry routing runs client-side */
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
          window.location.replace(res.ok && json.dest ? json.dest : '/student/tracker');
        })
        .catch(() => window.location.replace('/student/tracker'));
      return;
    }
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

  const wa = supportWhatsappUrl('Hi, I need help installing the CareerRai app.');
  const goToApp = () => {
    // Same fallback destination used everywhere else on this page — a student
    // choosing to continue in the browser is not blocked from using the app.
    window.location.assign('/student/tracker');
  };
  const goBack = () => {
    if (window.history.length > 1) window.history.back();
    else goToApp();
  };

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white px-6 pb-6 pt-4">
      <button type="button" onClick={goBack} className="flex items-center gap-0.5 self-start py-2 text-sm font-medium text-stone-500 hover:text-stone-700">
        <ChevronLeft className="h-4 w-4" /> Back
      </button>

      <div className="mx-auto flex w-full max-w-xs flex-1 flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-3xl shadow-lg shadow-stone-900/15">📲</div>
        <h1 className="mt-4 text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Add CareerRai to your Home&nbsp;Screen</h1>
        <p className="mt-2 text-sm text-stone-500">2 quick taps — then it opens like a real app, and you&apos;re signed in.</p>

        <div className="mt-6 w-full">
          {isIphone ? <InstallButton /> : <AndroidInstallGuide />}
        </div>

        <button
          type="button"
          onClick={goToApp}
          className="mt-6 w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
        >
          I&apos;ll do this later — continue to CareerRai →
        </button>
      </div>

      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer"
          className="mx-auto mt-3 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 active:scale-[0.98]">
          <MessageCircle className="h-[18px] w-[18px]" /> Facing issues? WhatsApp us
        </a>
      )}
    </div>
  );
}
