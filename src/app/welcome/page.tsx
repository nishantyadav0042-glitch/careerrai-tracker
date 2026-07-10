'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { OpenInBrowser } from '@/components/open-in-browser';
import { InstallAppButton } from '@/components/install-app-button';

// Public landing — the first thing a logged-out visitor (organic or ad
// traffic) sees at "/". Founder direction: classic black & white like Cal AI,
// BUT the phone previews must be real, dense sales assets — each one shows a
// single concrete thing the app does, not an empty wireframe. One tasteful
// signal accent (emerald = done / climbing, amber = still to do) keeps it
// alive without going rainbow. Primary CTA is pinned to the bottom so it is
// NEVER below the fold. Every preview maps to one of the four sales specs:
//   plan     → daily study plan ready, zero confusion what to study
//   topics   → every topic tracked: covered vs pending
//   buddy    → a real IIM buddy, 1:1 — no batches, no coaching
//   progress → climb like a topper, percentile mock over mock
const SCREENS = ['plan', 'topics', 'buddy', 'progress'] as const;
type ScreenId = (typeof SCREENS)[number];

const ROTATE_MS = 3200;

const CAPTIONS: Record<ScreenId, { title: string; sub: string }> = {
  plan: { title: 'Wake up to today’s plan.', sub: 'No more guessing what to study — it’s decided for you.' },
  topics: { title: 'Every topic, tracked.', sub: 'See exactly what’s revised and what’s still pending.' },
  buddy: { title: 'Your own IIM mentor.', sub: '1:1 guidance — no batches, no coaching classes.' },
  progress: { title: 'Climb like a topper.', sub: 'Watch your percentile move, mock over mock.' },
};

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-[380px] w-[210px] rounded-[2.1rem] border-[6px] border-stone-900 bg-white shadow-2xl shadow-stone-900/15">
      <div className="absolute left-1/2 top-0 z-10 h-3.5 w-16 -translate-x-1/2 rounded-b-xl bg-stone-900" />
      <div className="h-full w-full overflow-hidden rounded-[1.6rem] bg-stone-50 p-3 pt-5">{children}</div>
    </div>
  );
}

function ScreenTitle({ children }: { children: React.ReactNode }) {
  return <p className="mb-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{children}</p>;
}

// 1 — Daily study plan ready
function ScreenPlan() {
  const rows = [
    { tag: 'DILR', topic: 'Seating arrangement', time: '45m', state: 'done' as const },
    { tag: 'VARC', topic: 'RC — 2 passages', time: '40m', state: 'done' as const },
    { tag: 'QA', topic: 'Time, Speed & Distance', time: '50m', state: 'now' as const },
    { tag: 'QA', topic: 'Practice set · 15 Qs', time: '35m', state: 'next' as const },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <ScreenTitle>Today</ScreenTitle>
        <span className="text-[9.5px] font-semibold text-stone-500">Mon · 2h 50m</span>
      </div>
      <div className="flex flex-col gap-1.5">
        {rows.map((r) => (
          <div
            key={r.topic}
            className={`flex items-center gap-2 rounded-lg border bg-white px-2 py-1.5 ${
              r.state === 'now' ? 'border-stone-900 shadow-sm' : 'border-stone-200'
            }`}
          >
            <div
              className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-full border ${
                r.state === 'done' ? 'border-emerald-600 bg-emerald-600' : r.state === 'now' ? 'border-stone-900' : 'border-stone-300'
              }`}
            >
              {r.state === 'done' && <span className="text-[8px] leading-none text-white">✓</span>}
            </div>
            <span className="w-9 shrink-0 rounded bg-stone-100 py-0.5 text-center text-[8px] font-bold text-stone-600">{r.tag}</span>
            <p className={`flex-1 truncate text-[10px] font-medium ${r.state === 'done' ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{r.topic}</p>
            <span className="shrink-0 text-[8.5px] font-semibold text-stone-400">{r.time}</span>
          </div>
        ))}
      </div>
      <div className="mt-auto pt-2">
        <div className="flex items-center justify-between text-[9px] font-semibold text-stone-500">
          <span>2 of 4 done</span>
          <span className="text-emerald-600">on track</span>
        </div>
        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
          <div className="h-full w-1/2 rounded-full bg-emerald-500" />
        </div>
      </div>
    </div>
  );
}

// 2 — Every topic tracked: covered vs pending
function ScreenTopics() {
  const topics = [
    { name: 'Geometry', state: 'done' as const },
    { name: 'Reading Comprehension', state: 'done' as const },
    { name: 'Time & Work', state: 'learning' as const },
    { name: 'Probability', state: 'pending' as const },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <ScreenTitle>Syllabus map</ScreenTitle>
        <span className="text-[9.5px] font-semibold text-stone-500">28 topics</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <div className="rounded-lg border border-stone-200 bg-white py-1.5 text-center">
          <p className="text-lg font-bold leading-none text-emerald-600">18</p>
          <p className="mt-0.5 text-[8.5px] text-stone-500">revised</p>
        </div>
        <div className="rounded-lg border border-stone-200 bg-white py-1.5 text-center">
          <p className="text-lg font-bold leading-none text-amber-500">5</p>
          <p className="mt-0.5 text-[8.5px] text-stone-500">pending</p>
        </div>
      </div>
      <div className="mt-2 flex h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-emerald-500" style={{ width: '64%' }} />
        <div className="h-full bg-stone-400" style={{ width: '18%' }} />
        <div className="h-full bg-amber-400" style={{ width: '18%' }} />
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {topics.map((t) => (
          <div key={t.name} className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1">
            <span
              className={`h-2 w-2 shrink-0 rounded-full ${
                t.state === 'done' ? 'bg-emerald-500' : t.state === 'learning' ? 'bg-stone-400' : 'bg-amber-400'
              }`}
            />
            <p className="flex-1 truncate text-[9.5px] font-medium text-stone-700">{t.name}</p>
            <span className="text-[8px] font-semibold uppercase tracking-wide text-stone-400">
              {t.state === 'done' ? 'revised' : t.state === 'learning' ? 'learning' : 'to do'}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-1.5 text-center text-[9px] text-stone-400">Never a guess — always the real map</p>
    </div>
  );
}

// 3 — A real IIM buddy, 1:1
function ScreenBuddy() {
  return (
    <div className="flex h-full flex-col">
      <ScreenTitle>Your buddy</ScreenTitle>
      <div className="rounded-xl border border-stone-200 bg-white p-2.5">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-900 text-[11px] font-bold text-white">A</div>
          <div className="min-w-0">
            <div className="flex items-center gap-1">
              <p className="truncate text-[10.5px] font-bold text-stone-900">Ananya</p>
              <span className="shrink-0 rounded bg-emerald-50 px-1 py-0.5 text-[7.5px] font-bold text-emerald-700">✓ IIM</span>
            </div>
            <p className="text-[8.5px] text-stone-500">IIM Lucknow · 99.4 %ile</p>
          </div>
        </div>
        <div className="mt-2 rounded-lg bg-stone-50 p-2">
          <p className="text-[9.5px] leading-snug text-stone-700">“Saw you finished DILR today — keep that pace into the mocks. Ping me if RC feels slow.”</p>
        </div>
      </div>
      <div className="mt-2 flex flex-col gap-1">
        {['1:1 — just you and your mentor', 'No batches of 200', 'No coaching classes'].map((line) => (
          <div key={line} className="flex items-center gap-1.5">
            <span className="flex h-3 w-3 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[7px] text-white">✓</span>
            <p className="text-[9.5px] font-medium text-stone-700">{line}</p>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-1.5 text-center text-[9px] text-stone-400">They check in on you — not the other way around</p>
    </div>
  );
}

// 4 — Climb like a topper
function ScreenProgress() {
  const points = [72, 74, 79, 78, 83, 87, 90, 94];
  const w = 172, h = 76;
  const max = 100, min = 68;
  const coords = points.map((v, i) => ({
    x: (i / (points.length - 1)) * w,
    y: h - ((v - min) / (max - min)) * h,
  }));
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`).join(' ');
  const area = `${path} L${w},${h} L0,${h} Z`;
  const first = coords[0];
  const last = coords[coords.length - 1];
  const targetY = h - ((99 - min) / (max - min)) * h;
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <ScreenTitle>Mock percentile</ScreenTitle>
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-bold text-emerald-700">+22</span>
      </div>
      <div className="rounded-xl border border-stone-200 bg-white p-2.5">
        <svg viewBox={`0 0 ${w} ${h + 8}`} width="100%" height={h + 8} className="overflow-visible">
          <line x1={0} y1={targetY} x2={w} y2={targetY} stroke="#d6d3d1" strokeWidth={1} strokeDasharray="3 3" />
          <text x={w} y={targetY - 3} textAnchor="end" className="fill-stone-400" style={{ fontSize: 8, fontWeight: 700 }}>99 · topper</text>
          <path d={area} fill="#10b981" fillOpacity={0.08} />
          <path d={path} fill="none" stroke="#059669" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
          <circle cx={first.x} cy={first.y} r={3} fill="#a8a29e" />
          <circle cx={last.x} cy={last.y} r={4} fill="#059669" />
        </svg>
        <div className="mt-1.5 flex items-center justify-between text-[9px] font-semibold">
          <span className="text-stone-400">72 %ile · start</span>
          <span className="text-emerald-600">94 %ile · now</span>
        </div>
      </div>
      <p className="mt-auto pt-2 text-center text-[9px] text-stone-400">Tracked mock over mock — your climb to 99</p>
    </div>
  );
}

const RENDER: Record<ScreenId, () => React.ReactElement> = {
  plan: ScreenPlan,
  topics: ScreenTopics,
  buddy: ScreenBuddy,
  progress: ScreenProgress,
};

export default function WelcomePage() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion || paused) return;
    const id = setInterval(() => setActive((i) => (i + 1) % SCREENS.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [paused]);

  const id = SCREENS[active];
  const Screen = RENDER[id];
  const caption = CAPTIONS[id];

  return (
    <div className="flex min-h-[100dvh] flex-col bg-white text-stone-900">
      <OpenInBrowser />

      {/* Brand */}
      <div className="shrink-0 px-6 pt-5 text-center">
        <p className="text-sm font-bold tracking-tight">CareerRai</p>
      </div>

      {/* Hero — phone + synced caption, vertically centred in the free space */}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-4">
        <div
          onPointerDown={() => setPaused(true)}
          key={id}
          className="animate-[fadeIn_0.45s_ease]"
        >
          <PhoneFrame>
            <Screen />
          </PhoneFrame>
        </div>

        {/* Tappable dots — let a visitor drive the story */}
        <div className="flex items-center gap-1.5">
          {SCREENS.map((s, i) => (
            <button
              key={s}
              type="button"
              aria-label={`Show ${s}`}
              onClick={() => { setPaused(true); setActive(i); }}
              className={`h-1.5 rounded-full transition-all ${i === active ? 'w-5 bg-stone-900' : 'w-1.5 bg-stone-300'}`}
            />
          ))}
        </div>

        <div key={`cap-${id}`} className="min-h-[52px] max-w-xs animate-[fadeIn_0.45s_ease] text-center">
          <h1 className="text-xl font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
            {caption.title}
          </h1>
          <p className="mt-1 text-[13px] leading-snug text-stone-500">{caption.sub}</p>
        </div>
      </div>

      {/* CTA — pinned to the bottom, always in view, never below the fold */}
      <div className="sticky bottom-0 shrink-0 border-t border-stone-100 bg-white/95 px-6 pb-6 pt-4 backdrop-blur">
        <div className="mx-auto w-full max-w-xs space-y-2.5">
          <Link
            href="/start"
            className="flex w-full items-center justify-center rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition-transform active:scale-[0.98]"
          >
            Build my free study plan →
          </Link>
          <InstallAppButton variant="text" />
          <div className="flex items-center justify-center gap-1.5 pt-0.5 text-[11px] text-stone-400">
            <span>Already have a plan?</span>
            <Link href="/login" className="font-semibold text-stone-600 underline-offset-2 hover:underline">
              Log in
            </Link>
            <span className="text-stone-300">·</span>
            <Link href="/login" className="font-medium text-stone-500 hover:text-stone-700">
              I’m an IIM Buddy
            </Link>
          </div>
          <p className="text-center text-[11px] text-stone-400">Free to start · no credit card</p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
