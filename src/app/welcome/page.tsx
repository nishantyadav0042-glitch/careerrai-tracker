'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpenInBrowser } from '@/components/open-in-browser';

// Public landing — the first thing a logged-out visitor (organic or ad
// traffic) sees at "/". Founder direction: pure black & white, one screen,
// no scrolling essay — sell it the way Cal AI's landing does, with the
// product itself rotating through a phone frame instead of paragraphs of
// copy. Four honest previews of what the app actually shows a student;
// nothing here is a fabricated number.
const SCREENS = ['plan', 'buddy', 'progress', 'topics'] as const;
type ScreenId = (typeof SCREENS)[number];

const ROTATE_MS = 2800;

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-[420px] w-[220px] rounded-[2.25rem] border-[6px] border-stone-900 bg-white shadow-2xl shadow-stone-900/10">
      <div className="absolute left-1/2 top-0 h-4 w-20 -translate-x-1/2 rounded-b-xl bg-stone-900" />
      <div className="h-full w-full overflow-hidden rounded-[1.7rem] p-4 pt-6">{children}</div>
    </div>
  );
}

function ScreenPlan() {
  const rows = [
    { label: 'DILR — Seating arrangement', done: true },
    { label: 'VARC — RC practice set', done: true },
    { label: 'QA — Time, Speed & Distance', done: false },
  ];
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Today&apos;s plan</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center gap-2 rounded-xl border border-stone-200 px-3 py-2.5">
          <div className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${r.done ? 'border-stone-900 bg-stone-900' : 'border-stone-300'}`}>
            {r.done && <span className="text-[9px] leading-none text-white">✓</span>}
          </div>
          <p className="text-[11px] font-medium leading-tight text-stone-800">{r.label}</p>
        </div>
      ))}
    </div>
  );
}

function ScreenBuddy() {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Your buddy</p>
      <div className="flex items-start gap-2.5 rounded-xl border border-stone-200 p-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white">A</div>
        <div>
          <p className="text-[11px] font-semibold text-stone-900">Ananya · IIM Lucknow</p>
          <p className="mt-0.5 text-[10.5px] leading-snug text-stone-600">&quot;Saw you finished DILR today — keep that pace into the mocks.&quot;</p>
        </div>
      </div>
      <div className="rounded-xl border border-dashed border-stone-300 px-3 py-2.5 text-center text-[10.5px] text-stone-400">
        checks in on you, not the other way around
      </div>
    </div>
  );
}

function ScreenProgress() {
  const points = [8, 22, 18, 34, 40, 55, 62, 78];
  const w = 176, h = 90;
  const max = Math.max(...points), min = Math.min(...points);
  const path = points
    .map((v, i) => {
      const x = (i / (points.length - 1)) * w;
      const y = h - ((v - min) / (max - min)) * h;
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Your trajectory</p>
      <div className="rounded-xl border border-stone-200 p-3">
        <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} className="overflow-visible">
          <path d={path} fill="none" stroke="#1c1917" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={w} cy={h - ((points[points.length - 1] - min) / (max - min)) * h} r={3.5} fill="#1c1917" />
        </svg>
        <div className="mt-2 flex items-center justify-between text-[10px] text-stone-400">
          <span>Week 1</span>
          <span>Week 8</span>
        </div>
      </div>
      <p className="text-center text-[10.5px] text-stone-400">accuracy, tracked mock over mock</p>
    </div>
  );
}

function ScreenTopics() {
  return (
    <div className="flex h-full flex-col gap-3">
      <p className="text-[11px] font-bold uppercase tracking-wide text-stone-400">Syllabus coverage</p>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl border border-stone-200 p-3 text-center">
          <p className="text-2xl font-bold text-stone-900">18</p>
          <p className="text-[10px] text-stone-500">topics revised</p>
        </div>
        <div className="rounded-xl border border-stone-200 p-3 text-center">
          <p className="text-2xl font-bold text-stone-900">5</p>
          <p className="text-[10px] text-stone-500">topics pending</p>
        </div>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-100">
        <div className="h-full w-[78%] rounded-full bg-stone-900" />
      </div>
      <p className="text-center text-[10.5px] text-stone-400">never a guess, always the real map</p>
    </div>
  );
}

const RENDER: Record<ScreenId, () => React.ReactElement> = {
  plan: ScreenPlan,
  buddy: ScreenBuddy,
  progress: ScreenProgress,
  topics: ScreenTopics,
};

export default function WelcomePage() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) return;
    const id = setInterval(() => setActive((i) => (i + 1) % SCREENS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, []);

  const Screen = RENDER[SCREENS[active]];

  return (
    <div className="flex min-h-screen flex-col items-center bg-white px-6 py-10 text-stone-900">
      <OpenInBrowser />
      <p className="mb-8 text-sm font-bold tracking-tight">CareerRai</p>

      <div key={SCREENS[active]} className="animate-[fadeIn_0.4s_ease]">
        <PhoneFrame>
          <Screen />
        </PhoneFrame>
      </div>

      <div className="mt-5 flex items-center gap-1.5">
        {SCREENS.map((s, i) => (
          <span
            key={s}
            className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-stone-900' : 'w-1.5 bg-stone-200'}`}
          />
        ))}
      </div>

      <div className="mt-10 max-w-xs text-center">
        <h1 className="text-2xl font-bold leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          Stop guessing what to study today.
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-stone-500">
          One CAT plan built around your syllabus and your hours — with someone checking in so you actually follow it.
        </p>
      </div>

      <div className="mt-8 w-full max-w-xs space-y-3">
        <Link
          href="/start"
          className="flex w-full items-center justify-center rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-transform active:scale-[0.98]"
        >
          Build my free study plan →
        </Link>
        <Link
          href="/login"
          className="block w-full text-center text-xs font-medium text-stone-400 transition-colors hover:text-stone-700"
        >
          I&apos;m an IIM Buddy →
        </Link>
      </div>

      <p className="mt-10 text-[11px] text-stone-400">Free to start · no credit card</p>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
