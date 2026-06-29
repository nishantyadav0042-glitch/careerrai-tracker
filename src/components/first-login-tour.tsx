'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

// Mandatory one-time first-login walkthrough — a real sales asset. Each slide
// SHOWS a piece of the product (not just text): the trajectory, the daily habit,
// the 1-on-1 IIM buddy (our USP), decoded mocks, real percentile jumps — then the
// first action. English, premium, benefit-led. Gated by
// student_engagement.tour_completed; shown once to free non-demo students.

/* ── Product-preview visuals (lightweight mock cards) ───────────────────────── */

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="w-full max-w-[300px] rounded-2xl border border-stone-200 bg-white p-4 shadow-[0_8px_30px_rgba(0,0,0,0.06)]">
      {children}
    </div>
  );
}

function TrajectoryVisual() {
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Your trajectory</span>
        <span className="rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-bold text-orange-600">IIM Ahmedabad</span>
      </div>
      <svg viewBox="0 0 280 110" className="w-full">
        <defs>
          <linearGradient id="tj" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ea580c" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#ea580c" stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1="90" x2="280" y2="90" stroke="#e7e5e4" strokeWidth="1" />
        <path d="M5,82 C70,80 90,55 140,48 C190,41 220,20 275,12" fill="none" stroke="#ea580c" strokeWidth="3" strokeLinecap="round" />
        <path d="M5,82 C70,80 90,55 140,48 C190,41 220,20 275,12 L275,90 L5,90 Z" fill="url(#tj)" />
        <circle cx="5" cy="82" r="4" fill="#fff" stroke="#ea580c" strokeWidth="2.5" />
        <circle cx="275" cy="12" r="4.5" fill="#ea580c" />
      </svg>
      <div className="mt-1 flex items-center justify-between text-[11px] font-semibold text-stone-500">
        <span>Today · 71%ile</span>
        <span className="text-orange-600">Target · 95%ile</span>
      </div>
    </Card>
  );
}

function DailyLogVisual() {
  return (
    <Card>
      <div className="mb-3 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-900">Today&apos;s log</span>
        <span className="flex items-center gap-1 rounded-full bg-orange-50 px-2 py-0.5 text-[11px] font-bold text-orange-600">🔥 12-day streak</span>
      </div>
      <div className="space-y-2">
        <div className="flex items-center justify-between rounded-lg bg-stone-50 px-3 py-2 text-xs">
          <span className="text-stone-500">Hours studied</span><span className="font-bold text-stone-900">4.5h</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {['VARC', 'DILR', 'Mock'].map((t) => (
            <span key={t} className="rounded-md bg-teal-50 px-2 py-1 text-[11px] font-semibold text-teal-700">{t} ✓</span>
          ))}
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-stone-900 py-2 text-center text-xs font-semibold text-white">Logged in 30 seconds ✓</div>
    </Card>
  );
}

function BuddyVisual() {
  return (
    <Card>
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-teal-600 text-lg font-bold text-white">A</div>
        <div className="min-w-0">
          <p className="text-sm font-bold text-stone-900">Arjun · your buddy</p>
          <p className="text-[11px] font-medium text-teal-700">IIM Ahmedabad · 99.2%ile</p>
        </div>
        <span className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full bg-green-500" />
      </div>
      <div className="mt-3 rounded-2xl rounded-tl-sm bg-teal-50 px-3 py-2 text-xs leading-relaxed text-teal-900">
        Saw your mock — your DILR timing is the gap, not your accuracy. Let&apos;s fix set-selection this week. 💪
      </div>
    </Card>
  );
}

function MockVisual() {
  const rows = [
    { s: 'VARC', p: '88', w: 'w-[88%]', c: 'bg-teal-500' },
    { s: 'DILR', p: '64', w: 'w-[64%]', c: 'bg-orange-500' },
    { s: 'QA', p: '81', w: 'w-[81%]', c: 'bg-teal-500' },
  ];
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-bold text-stone-900">Mock #7 — decoded</span>
        <span className="text-[11px] font-semibold text-stone-400">with Arjun</span>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <div key={r.s} className="flex items-center gap-2">
            <span className="w-9 text-[11px] font-semibold text-stone-500">{r.s}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-stone-100">
              <div className={`h-full rounded-full ${r.c} ${r.w}`} />
            </div>
            <span className="w-8 text-right text-[11px] font-bold text-stone-700">{r.p}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">6 silly mistakes</span>
        <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">4 timing leaks</span>
      </div>
    </Card>
  );
}

function JumpVisual() {
  return (
    <Card>
      <p className="text-center text-[11px] font-semibold uppercase tracking-wide text-stone-400">A real student&apos;s season</p>
      <div className="mt-2 flex items-center justify-center gap-3">
        <div className="text-center">
          <p className="text-3xl font-black text-stone-300">79</p>
          <p className="text-[10px] font-semibold text-stone-400">June</p>
        </div>
        <svg width="40" height="24" viewBox="0 0 40 24" className="text-orange-500"><path d="M2 18 C14 18 22 8 34 5" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" /><path d="M28 4 L36 4 L36 12" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <div className="text-center">
          <p className="text-4xl font-black text-orange-600">94</p>
          <p className="text-[10px] font-semibold text-orange-600">CAT day</p>
        </div>
      </div>
      <div className="mt-2 rounded-lg bg-stone-50 py-1.5 text-center text-[11px] font-semibold text-stone-600">+15 %ile with a daily habit + an IIM mentor</div>
    </Card>
  );
}

function StartVisual() {
  const items = ['Pick your dream college', 'Take a 2-min baseline', 'Log day one'];
  return (
    <Card>
      <p className="mb-2 text-sm font-bold text-stone-900">Day 1 — let&apos;s set you up</p>
      <div className="space-y-2">
        {items.map((t, i) => (
          <div key={t} className="flex items-center gap-2.5">
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-orange-100 text-[11px] font-bold text-orange-600">{i + 1}</span>
            <span className="text-xs font-medium text-stone-700">{t}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ── Slides ─────────────────────────────────────────────────────────────────── */

interface Slide {
  badge: string;
  title: string;
  body: string;
  visual: React.ReactNode;
}

const SLIDES: Slide[] = [
  {
    badge: 'Why CareerRai',
    title: 'Toppers never prepare alone.',
    body: 'Talent is rarely the gap — accountability is. CareerRai keeps you on track every single day, the way a topper’s circle would. Free to start.',
    visual: <TrajectoryVisual />,
  },
  {
    badge: 'Your daily habit',
    title: '30 seconds a day. That’s your job.',
    body: 'Log what you studied, build a streak, and let momentum compound. The aspirant who shows up daily beats the one who crams in October.',
    visual: <DailyLogVisual />,
  },
  {
    badge: 'What makes us different',
    title: 'An IIM senior. 1-on-1. Only yours.',
    body: 'Not a batch of 200. A mentor who cracked CAT at 95%ile+, who knows your name, your weak sections, and your last mock — and builds the plan around you.',
    visual: <BuddyVisual />,
  },
  {
    badge: 'The real edge',
    title: 'Stop taking mocks blind.',
    body: 'Most aspirants take 30 mocks and learn from none. Your buddy decodes every mock with you — each silly slip, each timing leak — so the next score climbs.',
    visual: <MockVisual />,
  },
  {
    badge: 'It works',
    title: '79 → 94 percentile, one season.',
    body: 'Real students, real jumps. Consistency plus an IIM mentor is the edge that turns “someday” into a call letter from your dream IIM.',
    visual: <JumpVisual />,
  },
  {
    badge: 'Let’s begin',
    title: 'Your CAT journey starts today.',
    body: 'Set your dream college, take a quick baseline, and log day one. From here on, you’re never preparing alone again.',
    visual: <StartVisual />,
  },
];

export function FirstLoginTour() {
  const [i, setI] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const slide = SLIDES[i];
  const isLast = i === SLIDES.length - 1;

  function next() {
    if (!isLast) { setI(i + 1); return; }
    finish();
  }

  function finish() {
    setFinishing(true);
    fetch('/api/engagement', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'tour_completed' }),
    })
      .catch(() => {})
      .finally(() => window.location.reload());
  }

  return (
    <div className="fixed inset-0 z-[60] flex flex-col overflow-y-auto bg-white bg-gradient-to-b from-orange-50 to-white">
      <div className="mx-auto flex w-full max-w-md flex-1 flex-col px-6 pb-8 pt-6">
        {/* Progress */}
        <div className="flex gap-1.5">
          {SLIDES.map((_, idx) => (
            <div key={idx} className={`h-1 flex-1 rounded-full transition-all ${idx <= i ? 'bg-orange-600' : 'bg-stone-200'}`} />
          ))}
        </div>

        {/* Visual — the hero of each slide */}
        <div className="flex flex-1 items-center justify-center py-6">
          {slide.visual}
        </div>

        {/* Copy */}
        <div className="text-center">
          <span className="mb-3 inline-block rounded-full bg-orange-100 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-orange-700">
            {slide.badge}
          </span>
          <h1 className="text-[26px] font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            {slide.title}
          </h1>
          <p className="mx-auto mt-3 max-w-sm text-sm leading-relaxed text-stone-600">{slide.body}</p>
        </div>

        {/* Nav */}
        <div className="mt-7 space-y-3">
          <Button onClick={next} variant="primary" size="lg" className="w-full" disabled={finishing}>
            {finishing ? 'Setting up…' : isLast ? 'Start my prep →' : 'Next →'}
          </Button>
          {i > 0 && !finishing && (
            <div className="flex justify-center">
              <button type="button" onClick={() => setI(i - 1)} className="text-xs text-stone-400 hover:text-stone-600">← Back</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
