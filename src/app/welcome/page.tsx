'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { InstallButton } from '@/components/install/install-button';

// Public landing at "/". Founder direction: the phone previews are SALES
// ASSETS — colourful, dense, and convincing like Cal AI's, not flat
// wireframes (the in-app product stays black & white; the landing is the one
// place colour sells). Six rotating screens, one per concrete promise:
//   syllabus → set your own finish date
//   ontrack  → finish your syllabus on time
//   plan     → daily plan ready + real reminders
//   coverage → what's covered / left / revised
//   mock     → analyse every mock with an IIM buddy
//   chat     → chat 1:1 with your IIM buddy
const SCREENS = ['syllabus', 'ontrack', 'plan', 'coverage', 'mock', 'chat'] as const;
type ScreenId = (typeof SCREENS)[number];

const ROTATE_MS = 3200;

const CAPTIONS: Record<ScreenId, { title: string; sub: string }> = {
  syllabus: { title: 'Set your own finish date.', sub: 'You own the deadline — we build the plan around it.' },
  ontrack: { title: 'Finish your syllabus on time.', sub: 'Always know if today’s pace lands your date.' },
  plan: { title: 'Your day, planned. With reminders.', sub: 'Wake up knowing exactly what to study — and get nudged.' },
  coverage: { title: 'Covered, left, revised — live.', sub: 'Never lose track of your syllabus again.' },
  mock: { title: 'Analyse every mock with your buddy.', sub: 'A real IIM topper reads your score — not a bot.' },
  chat: { title: 'Chat 1:1 with your IIM buddy.', sub: 'Real guidance the moment you’re stuck.' },
};

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative mx-auto h-[404px] w-[224px] rounded-[2.2rem] border-[6px] border-stone-900 bg-white shadow-2xl shadow-stone-900/20">
      <div className="absolute left-1/2 top-0 z-10 h-3.5 w-16 -translate-x-1/2 rounded-b-xl bg-stone-900" />
      <div className="h-full w-full overflow-hidden rounded-[1.7rem] bg-stone-50 p-3 pt-5">{children}</div>
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="mb-2 text-[9.5px] font-bold uppercase tracking-[0.14em] text-stone-400">{children}</p>;
}

// Coloured rounded icon chip — the Cal-AI move that makes a card feel alive.
function Chip({ bg, children }: { bg: string; children: React.ReactNode }) {
  return <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg text-[11px] ${bg}`}>{children}</span>;
}

// 1 — Set your own finish date
function ScreenSyllabus() {
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>Your CAT deadline</Eyebrow>
      <div className="rounded-2xl border border-violet-100 bg-gradient-to-br from-violet-50 to-white p-3 text-center">
        <div className="mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-sm shadow-violet-200">🎯</div>
        <p className="text-[10px] font-semibold text-violet-500">Finish my syllabus by</p>
        <p className="text-2xl font-extrabold leading-tight text-stone-900">17 Sept</p>
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[9.5px] font-bold text-violet-700">✓ You set this</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {[
          { d: '17 Sept', tag: 'Your pick', h: '5h/day', on: true },
          { d: '2 Oct', tag: 'Balanced', h: '4h/day', on: false },
          { d: '28 Oct', tag: 'Steady', h: '3h/day', on: false },
        ].map((o) => (
          <div key={o.d} className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${o.on ? 'border-violet-500 bg-violet-50' : 'border-stone-200 bg-white'}`}>
            <div>
              <p className="text-[11px] font-bold text-stone-900">{o.d}</p>
              <p className="text-[8.5px] text-stone-400">{o.tag}</p>
            </div>
            <span className={`rounded-md px-1.5 py-0.5 text-[9px] font-bold ${o.on ? 'bg-violet-600 text-white' : 'bg-stone-100 text-stone-500'}`}>{o.h}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// 2 — Finish on time (pace vs deadline)
function ScreenOnTrack() {
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>Syllabus finish</Eyebrow>
      <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-3">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-500 text-white shadow-sm shadow-emerald-200">✓</div>
          <div>
            <p className="text-[13px] font-extrabold leading-tight text-emerald-700">On track</p>
            <p className="text-[9.5px] text-stone-500">Finishing <span className="font-bold text-stone-800">12 Sept</span></p>
          </div>
          <span className="ml-auto rounded-full bg-emerald-100 px-2 py-0.5 text-[9px] font-bold text-emerald-700">5 days early</span>
        </div>
      </div>
      {/* timeline: today → finish → deadline */}
      <div className="mt-3 px-1">
        <div className="relative h-1.5 w-full rounded-full bg-stone-200">
          <div className="absolute left-0 top-0 h-full w-[70%] rounded-full bg-emerald-500" />
          <div className="absolute left-[70%] top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-emerald-500 bg-white" />
        </div>
        <div className="mt-1.5 flex justify-between text-[8.5px] font-semibold text-stone-400">
          <span>Today</span><span className="text-emerald-600">12 Sep ✓</span><span>17 Sep</span>
        </div>
      </div>
      <div className="mt-3 space-y-1.5">
        {[
          { l: 'This week’s pace', v: '19h', c: 'text-emerald-600' },
          { l: 'Topics/week needed', v: '4.5', c: 'text-stone-800' },
          { l: 'Buffer before CAT', v: '10 wks', c: 'text-stone-800' },
        ].map((r) => (
          <div key={r.l} className="flex items-center justify-between rounded-lg bg-white px-2.5 py-1.5 border border-stone-100">
            <p className="text-[10px] text-stone-600">{r.l}</p>
            <p className={`text-[11px] font-bold ${r.c}`}>{r.v}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// 3 — Daily plan + reminders
function ScreenPlan() {
  const rows = [
    { tag: 'DILR', chip: 'bg-blue-100 text-blue-700', topic: 'Seating sets', time: '45m', done: true },
    { tag: 'VARC', chip: 'bg-violet-100 text-violet-700', topic: 'RC practice', time: '40m', done: true },
    { tag: 'QA', chip: 'bg-amber-100 text-amber-700', topic: 'Time & Speed', time: '50m', done: false },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Eyebrow>Today’s plan</Eyebrow>
        <span className="text-[9px] font-bold text-stone-400">Mon · 2h 15m</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.topic} className={`flex items-center gap-2 rounded-xl border bg-white px-2 py-1.5 ${r.done ? 'border-stone-100' : 'border-stone-300 shadow-sm'}`}>
            <span className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] ${r.done ? 'bg-emerald-500 text-white' : 'border-2 border-stone-300'}`}>{r.done ? '✓' : ''}</span>
            <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${r.chip}`}>{r.tag}</span>
            <p className={`flex-1 truncate text-[10px] font-semibold ${r.done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{r.topic}</p>
            <span className="text-[8.5px] font-bold text-stone-400">{r.time}</span>
          </div>
        ))}
      </div>
      {/* reminder toast */}
      <div className="mt-2 flex items-center gap-2 rounded-xl border border-orange-200 bg-gradient-to-r from-orange-50 to-white px-2.5 py-2">
        <Chip bg="bg-orange-500 text-white">🔔</Chip>
        <div className="min-w-0">
          <p className="text-[10px] font-bold text-stone-800">9:00 PM reminder</p>
          <p className="text-[9px] text-stone-500 truncate">Revise Geometry before bed</p>
        </div>
      </div>
      <div className="mt-2 flex items-center justify-between rounded-xl bg-stone-900 px-3 py-2">
        <p className="text-[10px] font-semibold text-white">2 of 3 done</p>
        <span className="text-[9px] font-bold text-emerald-300">🔥 12-day streak</span>
      </div>
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
        <div className="h-full w-2/3 rounded-full bg-emerald-500" />
      </div>
    </div>
  );
}

// 4 — Coverage: covered / left / revised
function ScreenCoverage() {
  const topics = [
    { n: 'Geometry', s: 'revised', c: 'bg-blue-500' },
    { n: 'Reading Comp', s: 'covered', c: 'bg-emerald-500' },
    { n: 'Probability', s: 'left', c: 'bg-amber-400' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Eyebrow>Syllabus map</Eyebrow>
        <span className="text-[9px] font-bold text-stone-400">46 topics</span>
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        {[
          { v: 28, l: 'covered', bg: 'from-emerald-50', t: 'text-emerald-600' },
          { v: 13, l: 'left', bg: 'from-amber-50', t: 'text-amber-500' },
          { v: 18, l: 'revised', bg: 'from-blue-50', t: 'text-blue-600' },
        ].map((s) => (
          <div key={s.l} className={`rounded-xl border border-stone-100 bg-gradient-to-b ${s.bg} to-white py-1.5 text-center`}>
            <p className={`text-lg font-extrabold leading-none ${s.t}`}>{s.v}</p>
            <p className="mt-0.5 text-[8px] font-semibold text-stone-500">{s.l}</p>
          </div>
        ))}
      </div>
      <div className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-stone-200">
        <div className="h-full bg-emerald-500" style={{ width: '61%' }} />
        <div className="h-full bg-blue-500" style={{ width: '14%' }} />
        <div className="h-full bg-amber-400" style={{ width: '25%' }} />
      </div>
      <div className="mt-2 space-y-1">
        {topics.map((t) => (
          <div key={t.n} className="flex items-center gap-2 rounded-lg bg-white px-2 py-1.5 border border-stone-100">
            <span className={`h-2 w-2 rounded-full ${t.c}`} />
            <p className="flex-1 truncate text-[10px] font-semibold text-stone-700">{t.n}</p>
            <span className="text-[8px] font-bold uppercase tracking-wide text-stone-400">{t.s}</span>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-1.5 text-center text-[8.5px] text-stone-400">Always the real map — never a guess</p>
    </div>
  );
}

// 5 — Mock analysis with buddy
function ScreenMock() {
  const secs = [
    { n: 'VARC', v: 88, w: '88%', c: 'bg-violet-500' },
    { n: 'DILR', v: 79, w: '79%', c: 'bg-blue-500' },
    { n: 'QA', v: 95, w: '95%', c: 'bg-emerald-500' },
  ];
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>Mock #6 · analysed</Eyebrow>
      <div className="flex items-center gap-3 rounded-2xl border border-stone-100 bg-gradient-to-br from-emerald-50 to-white p-3">
        <div>
          <p className="text-2xl font-extrabold leading-none text-stone-900">92.4</p>
          <p className="text-[8.5px] font-semibold text-stone-500">percentile</p>
        </div>
        <span className="ml-auto rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-bold text-emerald-700">▲ +6.1</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {secs.map((s) => (
          <div key={s.n}>
            <div className="flex justify-between text-[9px] font-bold text-stone-600">
              <span>{s.n}</span><span>{s.v}</span>
            </div>
            <div className="mt-0.5 h-1.5 w-full rounded-full bg-stone-200">
              <div className={`h-full rounded-full ${s.c}`} style={{ width: s.w }} />
            </div>
          </div>
        ))}
      </div>
      {/* buddy annotation */}
      <div className="mt-2 flex items-start gap-2 rounded-xl border border-blue-100 bg-blue-50/60 p-2">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">A</span>
        <p className="text-[9.5px] leading-snug text-stone-700"><span className="font-bold">Ananya:</span> DILR set-selection cost you 4 marks — let’s fix that pattern.</p>
      </div>
    </div>
  );
}

// 6 — Chat with buddy
function ScreenChat() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-stone-100 pb-2">
        <span className="relative flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-violet-600 text-[12px] font-bold text-white">
          A<span className="absolute -bottom-0 -right-0 h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-500" />
        </span>
        <div>
          <p className="text-[11px] font-bold text-stone-900">Ananya</p>
          <p className="text-[8.5px] text-emerald-600">IIM Lucknow · online</p>
        </div>
      </div>
      <div className="mt-2 flex flex-1 flex-col gap-1.5">
        <div className="max-w-[80%] self-start rounded-2xl rounded-tl-sm bg-stone-100 px-2.5 py-1.5 text-[9.5px] text-stone-700">How did today’s RC go?</div>
        <div className="max-w-[80%] self-end rounded-2xl rounded-tr-sm bg-stone-900 px-2.5 py-1.5 text-[9.5px] text-white">Better! 4 of 5 correct 🎉</div>
        <div className="max-w-[85%] self-start rounded-2xl rounded-tl-sm bg-stone-100 px-2.5 py-1.5 text-[9.5px] text-stone-700">That’s the jump we wanted. Keep the daily habit 🙌</div>
        <div className="max-w-[70%] self-end rounded-2xl rounded-tr-sm bg-stone-900 px-2.5 py-1.5 text-[9.5px] text-white">On it 💪</div>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-full border border-stone-200 bg-white px-3 py-1.5">
        <p className="flex-1 text-[9.5px] text-stone-400">Message Ananya…</p>
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-[10px] text-white">↑</span>
      </div>
    </div>
  );
}

const RENDER: Record<ScreenId, () => React.ReactElement> = {
  syllabus: ScreenSyllabus,
  ontrack: ScreenOnTrack,
  plan: ScreenPlan,
  coverage: ScreenCoverage,
  mock: ScreenMock,
  chat: ScreenChat,
};

export default function WelcomePage() {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  // Account deletion lands here with ?deleted=1 — the loudest action a user can
  // take deserves explicit confirmation (Apple 5.1.1(v)), not a silent redirect.
  const [deleted, setDeleted] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect -- reading the URL is client-only */
    try { if (new URLSearchParams(window.location.search).get('deleted') === '1') setDeleted(true); } catch { /* ignore */ }
  }, []);

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

      {deleted && (
        <div className="shrink-0 bg-emerald-50 px-6 py-3 text-center">
          <p className="text-sm font-semibold text-emerald-800">
            Your account and all your data have been permanently deleted. You&apos;ve been signed out.
          </p>
          <button type="button" onClick={() => setDeleted(false)} className="mt-1 text-xs font-medium text-emerald-700 underline underline-offset-2">
            Dismiss
          </button>
        </div>
      )}

      <div className="shrink-0 px-6 pt-5 text-center">
        <p className="text-sm font-bold tracking-tight">CareerRai</p>
        {/* Descriptor for strangers — clarity in the first 3 seconds. */}
        <p className="mt-0.5 text-[11px] font-medium text-stone-400">CAT prep, tracked — with a real IIM buddy</p>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 px-6 py-4">
        <div onPointerDown={() => setPaused(true)} key={id} className="animate-[fadeIn_0.45s_ease]">
          <PhoneFrame>
            <Screen />
          </PhoneFrame>
        </div>

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

        <div key={`cap-${id}`} className="min-h-[54px] max-w-xs animate-[fadeIn_0.45s_ease] text-center">
          <h1 className="text-xl font-bold leading-tight" style={{ fontFamily: 'Georgia, serif' }}>{caption.title}</h1>
          <p className="mt-1 text-[13px] leading-snug text-stone-500">{caption.sub}</p>
        </div>
      </div>

      <div className="sticky bottom-0 shrink-0 border-t border-stone-100 bg-white/95 px-6 pb-6 pt-4 backdrop-blur">
        <div className="mx-auto w-full max-w-xs space-y-2.5">
          <Link
            href="/start"
            className="flex w-full items-center justify-center rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white shadow-lg shadow-stone-900/15 transition-transform active:scale-[0.98]"
          >
            Start your journey →
          </Link>
          <Link
            href="/login"
            className="flex w-full items-center justify-center rounded-2xl border border-stone-300 bg-white py-3.5 text-sm font-semibold text-stone-800 transition-transform active:scale-[0.98]"
          >
            Already a student or buddy? Log in
          </Link>
          <InstallButton variant="text" />
          <p className="text-center text-[11px] text-stone-400">Free to start · no credit card</p>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
