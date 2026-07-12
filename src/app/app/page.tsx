'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Share, SquarePlus, Plus, MoreVertical, MessageCircle } from 'lucide-react';
import { supportWhatsappUrl } from '@/lib/whatsapp';

// The installed-PWA entry point. Two jobs, decided by display mode:
//  • Standalone (opened from Home Screen): exchange the one-time hand-off token
//    for a real session, so the installed app lands logged in.
//  • Browser: a clean, STATIC "Add to Home Screen" guide — two plain steps, no
//    animation. We don't consume the token here — leaving it in the URL means
//    Add-to-Home-Screen saves it, so the first launch auto-logs-in.
function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia?.('(display-mode: standalone)').matches
    || ('standalone' in window.navigator && (window.navigator as { standalone?: boolean }).standalone === true);
}
function isIOS(): boolean {
  return typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);
}

export default function AppEntry() {
  const [state, setState] = useState<'checking' | 'exchanging' | 'guide'>('checking');
  const [ios, setIos] = useState(false);

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
    setIos(isIOS());
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

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white px-6 pb-6 pt-10">
      <div className="mx-auto flex w-full max-w-xs flex-1 flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-3xl shadow-lg shadow-stone-900/15">📲</div>
        <h1 className="mt-4 text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Add CareerRai to your Home&nbsp;Screen</h1>
        <p className="mt-2 text-sm text-stone-500">2 quick taps — then it opens like a real app, and you&apos;re signed in.</p>

        <div className="mt-6 w-full space-y-3 text-left">
          {ios ? (
            <>
              <Step n={1} icon={<Share className="h-5 w-5 text-blue-600" />}>
                Tap the <b>Share</b> icon <span className="text-stone-400">(top or bottom of Safari)</span>
              </Step>
              <Step n={2} icon={<SquarePlus className="h-5 w-5 text-stone-700" />}>
                Tap <b>&ldquo;Add to Home Screen&rdquo;</b>, then <b>Add</b>
              </Step>
            </>
          ) : (
            <>
              <Step n={1} icon={<MoreVertical className="h-5 w-5 text-stone-700" />}>
                Tap the <b>menu</b> <span className="text-stone-400">(⋮ top-right)</span>
              </Step>
              <Step n={2} icon={<Plus className="h-5 w-5 text-stone-700" />}>
                Tap <b>Install app</b> or <b>Add to Home screen</b>
              </Step>
            </>
          )}
        </div>
      </div>

      {wa && (
        <a href={wa} target="_blank" rel="noopener noreferrer"
          className="mx-auto mt-6 flex w-full max-w-xs items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-sm font-bold text-emerald-700 active:scale-[0.98]">
          <MessageCircle className="h-[18px] w-[18px]" /> Facing issues? WhatsApp us
        </a>
      )}
    </div>
  );
}

function Step({ n, icon, children }: { n: number; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-stone-200 bg-stone-50 p-3.5">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-900 text-sm font-bold text-white">{n}</span>
      <p className="flex-1 text-sm leading-snug text-stone-800">{children}</p>
      <span className="shrink-0">{icon}</span>
    </div>
  );
}
