'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { Share, SquarePlus, Copy, Bookmark, Plus, MessageCircle } from 'lucide-react';
import { supportWhatsappUrl } from '@/lib/whatsapp';

// The installed-PWA entry point. Two jobs, decided by display mode:
//  • Standalone (opened from the Home Screen): a one-time hand-off token in the
//    URL is exchanged for a real session, so the installed app lands logged in.
//  • Browser: a fast, icon-first "Add to Home Screen" guide. Designed to be read
//    in a glance — the Share icon is the hero and is shown glowing at BOTH the
//    top and bottom of a phone, because Safari puts it in whichever bar the user
//    has. We DON'T consume the token here — leaving it in the URL means A2HS
//    saves it, so the first launch of the installed app can auto-log-in.
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
  const [gstep, setGstep] = useState<0 | 1>(0);

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

  const waUrl = supportWhatsappUrl('Hi, I need help installing the CareerRai app.');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white px-5 pb-6 pt-9">
      <div className="mx-auto flex w-full max-w-[330px] flex-1 flex-col items-center justify-center text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-2xl shadow-lg shadow-stone-900/15">📲</div>
        <h1 className="mt-3 text-[19px] font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>Install in 2 taps</h1>

        {ios ? (
          gstep === 0 ? (
            <div className="mt-6 w-full animate-[fadeIn_.3s_ease]">
              <Dots step={0} />
              <p className="mt-4 text-[18px] font-bold leading-tight text-stone-900">
                Tap <Share className="inline h-[22px] w-[22px] align-text-bottom text-blue-600" /> <span className="text-blue-600">Share</span>
              </p>
              <WhereIsShare />
              <button type="button" onClick={() => setGstep(1)}
                className="mt-5 w-full rounded-2xl bg-stone-900 py-3.5 text-[15px] font-bold text-white active:scale-[0.98]">
                Done — next
              </button>
            </div>
          ) : (
            <div className="mt-6 w-full animate-[fadeIn_.3s_ease]">
              <Dots step={1} />
              <p className="mt-4 text-[18px] font-bold leading-tight text-stone-900">
                Tap <span className="whitespace-nowrap">&ldquo;Add to Home&nbsp;Screen&rdquo;</span>
              </p>
              <ShareSheetMock />
              <button type="button" onClick={() => setGstep(0)}
                className="mt-4 text-xs font-medium text-stone-400 active:text-stone-600">← back</button>
            </div>
          )
        ) : (
          <AndroidVisual />
        )}
      </div>

      {waUrl && (
        <a href={waUrl} target="_blank" rel="noopener noreferrer"
          className="mx-auto mt-5 flex w-full max-w-[330px] items-center justify-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 py-3 text-[14px] font-bold text-emerald-700 active:scale-[0.98]">
          <MessageCircle className="h-[18px] w-[18px]" /> Facing issues? WhatsApp us
        </a>
      )}

      <style>{`
        @keyframes fadeIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes crPing{75%,100%{transform:scale(1.9);opacity:0}}
        .pulse{animation:crPing 1.4s cubic-bezier(0,0,.2,1) infinite}
        @media (prefers-reduced-motion:reduce){.pulse{animation:none!important}}
      `}</style>
    </div>
  );
}

function Dots({ step }: { step: 0 | 1 }) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <span className={`h-1.5 rounded-full transition-all ${step === 0 ? 'w-5 bg-stone-900' : 'w-1.5 bg-stone-300'}`} />
      <span className={`h-1.5 rounded-full transition-all ${step === 1 ? 'w-5 bg-stone-900' : 'w-1.5 bg-stone-300'}`} />
    </div>
  );
}

// Answers "where is the Share button?" for BOTH Safari layouts at a glance — the
// icon pulses at the top bar AND the bottom bar, so the student just looks for
// the glowing icon wherever it is on their phone. No reading required.
function WhereIsShare() {
  return (
    <>
      <div className="mx-auto mt-4 w-[146px] overflow-hidden rounded-[20px] border-[3px] border-stone-800 bg-white">
        <div className="flex items-center gap-1.5 border-b border-stone-100 px-2 py-1.5">
          <span className="h-2 flex-1 rounded bg-stone-200" />
          <PulseShare />
        </div>
        <div className="flex h-[100px] items-center justify-center bg-stone-50">
          <span className="text-[10px] font-semibold text-stone-300">CareerRai</span>
        </div>
        <div className="flex items-center justify-around border-t border-stone-100 px-3 py-1.5">
          <span className="h-3 w-3 rounded-full bg-stone-200" />
          <PulseShare />
          <span className="h-3 w-3 rounded-full bg-stone-200" />
        </div>
      </div>
      <p className="mt-2.5 text-[12.5px] text-stone-500">Top <b className="text-stone-700">or</b> bottom of Safari.</p>
    </>
  );
}

function PulseShare() {
  return (
    <span className="relative flex h-5 w-5 items-center justify-center">
      <span className="pulse absolute inset-[-5px] rounded-full bg-blue-500/25" />
      <span className="absolute inset-[-5px] rounded-full border-2 border-blue-500" />
      <Share className="relative h-[15px] w-[15px] text-blue-600" />
    </span>
  );
}

// The iOS Share sheet with "Add to Home Screen" circled — the one row they tap.
function ShareSheetMock() {
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-stone-200 bg-white text-left shadow-sm">
      <Row muted icon={<Copy className="h-4 w-4 text-stone-400" />} label="Copy" />
      <Row muted icon={<Bookmark className="h-4 w-4 text-stone-400" />} label="Add Bookmark" />
      <div className="relative flex items-center justify-between bg-blue-50 px-3.5 py-3 ring-2 ring-inset ring-blue-500">
        <span className="text-[14px] font-bold text-stone-900">Add to Home Screen</span>
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span className="pulse absolute inset-[-5px] rounded-full bg-blue-500/25" />
          <span className="absolute inset-[-5px] rounded-full border-2 border-blue-500" />
          <SquarePlus className="relative h-5 w-5 text-stone-900" />
        </span>
      </div>
      <Row muted icon={<Share className="h-4 w-4 text-stone-400" />} label="Markup" />
    </div>
  );
}

function Row({ icon, label, muted }: { icon: ReactNode; label: string; muted?: boolean }) {
  return (
    <div className={`flex items-center justify-between border-b border-stone-100 px-3.5 py-2.5 ${muted ? 'opacity-45' : ''}`}>
      <span className="text-[13px] text-stone-700">{label}</span>{icon}
    </div>
  );
}

// Android landing here directly (rare — the Install button routes Android to an
// in-place coach). Same icon-first treatment: point at the ⋮ menu, show the chip.
function AndroidVisual() {
  return (
    <div className="mt-6 w-full animate-[fadeIn_.3s_ease]">
      <div className="mx-auto flex w-[150px] items-center justify-end rounded-t-[18px] border-[3px] border-b-0 border-stone-800 bg-white px-2.5 py-2">
        <span className="relative flex h-6 w-6 items-center justify-center">
          <span className="pulse absolute inset-[-5px] rounded-full bg-orange-500/25" />
          <span className="absolute inset-[-5px] rounded-full border-2 border-orange-500" />
          <span className="relative text-lg font-black leading-none text-stone-800">⋮</span>
        </span>
      </div>
      <div className="mx-auto h-3 w-[150px] border-x-[3px] border-stone-800 bg-stone-50" />
      <div className="mx-auto h-[3px] w-[150px] bg-stone-800" />
      <p className="mt-4 text-[18px] font-bold text-stone-900">Tap the <span className="text-orange-600">⋮ menu</span></p>
      <p className="mt-1 text-[12.5px] text-stone-500">then tap</p>
      <span className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-stone-100 px-3 py-2 text-sm font-bold text-stone-800">
        <Plus className="h-4 w-4" /> Install app
      </span>
    </div>
  );
}
