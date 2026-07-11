'use client';

import { useEffect, useState } from 'react';
import { Share, SquarePlus, Copy, Bookmark, Plus } from 'lucide-react';

// The installed-PWA entry point. Two jobs, decided by display mode:
//  • Standalone (opened from the Home Screen): a one-time hand-off token in
//    the URL is exchanged for a real session, so an iPhone user who installed
//    the app lands logged in instead of on a cold login screen.
//  • Browser (Safari): a VISUAL, step-by-step "Add to Home Screen" walkthrough
//    (founder: show them where to tap, don't just list steps). We DON'T consume
//    the token here — leaving it in the URL means A2HS saves it, so the first
//    launch of the installed app can auto-log-in.
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
  const [gstep, setGstep] = useState<0 | 1>(0); // iOS walkthrough step

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

  return (
    <div className="flex min-h-[100dvh] flex-col items-center bg-white px-6 py-8 text-center">
      <div className="mx-auto flex w-full max-w-xs flex-1 flex-col items-center justify-center gap-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900 text-2xl shadow-lg shadow-stone-900/15">📲</div>
        <div>
          <h1 className="text-xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Add CareerRai to your Home&nbsp;Screen</h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-500">
            <span className="font-semibold text-stone-700">Just 3&nbsp;MB.</span> It&apos;s your job #1 — and the only way reminders reach you{ios ? ' on iPhone' : ''}. You&apos;ll be <span className="font-semibold text-stone-700">signed in automatically.</span>
          </p>
        </div>

        {ios ? (
          <div className="w-full">
            {/* step dots */}
            <div className="mb-3 flex items-center justify-center gap-1.5">
              <span className={`h-1.5 rounded-full transition-all ${gstep === 0 ? 'w-5 bg-stone-900' : 'w-1.5 bg-stone-300'}`} />
              <span className={`h-1.5 rounded-full transition-all ${gstep === 1 ? 'w-5 bg-stone-900' : 'w-1.5 bg-stone-300'}`} />
            </div>

            {gstep === 0 ? (
              <div className="animate-[fadeIn_0.35s_ease]">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Step 1 of 2</p>
                <p className="mb-3 mt-0.5 text-base font-bold text-stone-900">Tap the Share icon</p>
                <SafariBarMock />
                <p className="mt-2 text-[12px] leading-snug text-stone-500">
                  It sits next to the web address — <b>top-right</b> on most iPhones, or in the <b>bottom bar</b> on some. Look for this icon: <Share className="inline h-3.5 w-3.5 align-text-bottom text-blue-600" />
                </p>
                <button
                  type="button"
                  onClick={() => setGstep(1)}
                  className="mt-4 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white active:scale-[0.98]"
                >
                  I tapped Share — next →
                </button>
              </div>
            ) : (
              <div className="animate-[fadeIn_0.35s_ease]">
                <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Step 2 of 2</p>
                <p className="mb-3 mt-0.5 text-base font-bold text-stone-900">Tap &ldquo;Add to Home Screen&rdquo;</p>
                <ShareSheetMock />
                <p className="mt-2 text-center text-[12px] font-bold text-rose-600">👆 Tap the circled row</p>
                <div className="mt-3 rounded-xl bg-emerald-50 px-3 py-2.5 text-left text-[12px] leading-snug text-emerald-800">
                  <b>Then:</b> tap <b>Add</b>, open <b>CareerRai</b>{' '}from your Home Screen — you&apos;ll be signed in and land straight on your plan.
                </div>
                <button
                  type="button"
                  onClick={() => setGstep(0)}
                  className="mt-3 w-full py-2.5 text-xs font-medium text-stone-400 hover:text-stone-600"
                >
                  ← Back to step 1
                </button>
              </div>
            )}
            <p className="mt-3 text-[11px] text-stone-400">Works in <b>Safari</b> only. In Chrome? Open this page in Safari first.</p>
          </div>
        ) : (
          <div className="w-full space-y-2.5 text-left">
            <AndroidStep n={1}><>Open your browser menu (<b>⋮</b>, top-right).</></AndroidStep>
            <AndroidStep n={2}><>Tap <span className="mx-0.5 inline-flex items-center gap-1 rounded-md bg-stone-100 px-1.5 py-0.5 align-middle font-semibold text-stone-800"><Plus className="h-3.5 w-3.5" />Install app</span> or <b>Add to Home screen</b>.</></AndroidStep>
            <AndroidStep n={3}><>Confirm — CareerRai installs like a normal app, signed in.</></AndroidStep>
          </div>
        )}
      </div>

      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: translateY(0); } }`}</style>
    </div>
  );
}

// A faithful mock of Safari's ADDRESS BAR with the Share icon highlighted on
// the right — Share lives next to the web address whether Safari's bar is at
// the top or the bottom, so this reads correctly for every layout.
function SafariBarMock() {
  return (
    <div className="rounded-2xl border border-stone-200 bg-stone-100 p-3">
      <div className="flex items-center gap-2 rounded-full bg-white px-3 py-2.5 shadow-sm">
        <span className="text-[13px] font-semibold text-stone-400">aA</span>
        <span className="min-w-0 flex-1 truncate text-center text-[13px] text-stone-500">careerrai-daily.vercel.app</span>
        <span className="relative flex h-6 w-6 items-center justify-center">
          {/* hand-circled annotation on the exact tap target */}
          <span className="absolute -inset-2 animate-ping rounded-full bg-rose-400/25" />
          <span className="absolute -inset-2 rounded-full border-[2.5px] border-rose-500" />
          <Share className="relative h-5 w-5 text-blue-600" />
        </span>
      </div>
      <p className="mt-2 text-center text-[12px] font-bold text-rose-600">👆 Tap the circled Share icon</p>
    </div>
  );
}

// A faithful mock of the iOS Share sheet with "Add to Home Screen" highlighted.
function ShareSheetMock() {
  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-50 text-left shadow-sm">
      <div className="flex items-center gap-2.5 border-b border-stone-200 bg-white px-3 py-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-stone-900 text-sm">📲</div>
        <div className="min-w-0">
          <p className="text-[13px] font-bold text-stone-900">CareerRai</p>
          <p className="truncate text-[10px] text-stone-400">careerrai-daily.vercel.app</p>
        </div>
      </div>
      <div className="bg-white">
        <ActionRow icon={<Copy className="h-4 w-4 text-stone-400" />} label="Copy" muted />
        <ActionRow icon={<Bookmark className="h-4 w-4 text-stone-400" />} label="Add Bookmark" muted />
        <div className="relative flex items-center justify-between bg-rose-50/70 px-3 py-2.5 ring-2 ring-inset ring-rose-400">
          <span className="text-[13px] font-bold text-stone-900">Add to Home Screen</span>
          <span className="relative flex h-6 w-6 items-center justify-center">
            <span className="absolute -inset-1.5 animate-ping rounded-full bg-rose-400/25" />
            <span className="absolute -inset-1.5 rounded-full border-[2.5px] border-rose-500" />
            <SquarePlus className="relative h-5 w-5 text-stone-900" />
          </span>
        </div>
        <ActionRow icon={<Share className="h-4 w-4 text-stone-400" />} label="Markup" muted />
      </div>
    </div>
  );
}

function ActionRow({ icon, label, muted }: { icon: React.ReactNode; label: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-stone-100 px-3 py-2.5 ${muted ? 'opacity-55' : ''}`}>
      <span className="text-[13px] text-stone-700">{label}</span>
      {icon}
    </div>
  );
}

function AndroidStep({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xs font-bold text-white">{n}</span>
      <p className="text-sm leading-snug text-stone-700">{children}</p>
    </div>
  );
}
