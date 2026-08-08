'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { InstallButton } from '@/components/install/install-button';

// Public landing at "/". Founder direction: the phone previews are SALES
// ASSETS — colourful, dense, and convincing like Cal AI's, not flat
// wireframes (the in-app product stays black & white; the landing is the one
// place colour sells).
//
// REFRESHED 29 Jul (founder: "our live screens on the very first screen are
// very old"). Every preview must depict a screen the app ACTUALLY has today —
// a landing page selling a UI the product dropped weeks ago is worse than no
// preview, because the first thing a new student notices after installing is
// that they were shown something else.
//
// What changed and why:
//   · plan REBUILT — was a generic checkbox list with strike-throughs and a
//     "9:00 PM reminder" toast; now mirrors TodaysRoutineCard (Start Here /
//     Next badges, per-task minutes) and the real CTA wording.
//   · rebuild ADDED — the 0→100% plan rebuild plus the because-line. The
//     product's actual differentiator, shipped this week, previously unsold.
//   · dailypick ADDED — Today's Top Pick, live since 29 Jul.
//   · plan leads the rotation: the daily experience is the most concrete
//     thing a stranger can understand in three seconds.
// Order is a marketing call, easy to change — the story is:
//   what today looks like → it adapts to you → you own the date → you land it
//   → mocks read by a human → that human is a tap away → students help too.
const SCREENS = ['plan', 'rebuild', 'syllabus', 'ontrack', 'coverage', 'mock', 'chat', 'dailypick'] as const;
type ScreenId = (typeof SCREENS)[number];

// 8 screens at 3.2s is a 25s cycle — too long to ever be seen whole. 2.6s keeps
// the full story inside ~21s while staying readable.
const ROTATE_MS = 2600;

const CAPTIONS: Record<ScreenId, { title: string; sub: string }> = {
  plan: { title: 'Know exactly what to study today.', sub: 'Three blocks, in order, with the first one marked.' },
  rebuild: { title: 'Your daily update rebuilds the plan.', sub: 'Tell us how the day went — today reshapes around it.' },
  syllabus: { title: 'Set your own finish date.', sub: 'You own the deadline — we build the plan around it.' },
  ontrack: { title: 'Finish your syllabus on time.', sub: 'Always know if today’s pace lands your date.' },
  coverage: { title: 'Covered, left, revised — live.', sub: 'Never lose track of your syllabus again.' },
  mock: { title: 'Analyse every mock with your buddy.', sub: 'A real IIM topper reads your score — not a bot.' },
  chat: { title: 'Chat 1:1 with your IIM buddy.', sub: 'Real guidance the moment you’re stuck.' },
  dailypick: { title: 'One tricky question a day.', sub: 'Picked by students, for students — vote on what stays.' },
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

// (The Chip helper lived here. Its only caller was the old plan screen's
// "9:00 PM reminder" toast, removed in the 29 Jul refresh — deleted rather than
// left as dead code for a future reader to wonder about.)

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

// 3 — Today's Study Plan, as it ACTUALLY looks in the app now.
//
// Rebuilt 29 Jul: the old version showed a generic checkbox list with strike-
// throughs and a "9:00 PM reminder" toast — a design the product has not used
// for weeks. A landing page that previews screens the app no longer has is
// worse than no preview: the first thing a new student notices after installing
// is that they were shown something else. This mirrors TodaysRoutineCard: the
// "Start Here" badge on the first task, "Next" on the rest, per-task minutes,
// and the real home CTA wording ("Update topics studied today").
function ScreenPlan() {
  const rows = [
    { tag: 'QA', chip: 'bg-amber-100 text-amber-700', topic: 'Ratio & Proportion', time: '40m', badge: 'Start Here' },
    { tag: 'VARC', chip: 'bg-violet-100 text-violet-700', topic: 'Reading Comprehension', time: '30m', badge: 'Next' },
    { tag: 'DILR', chip: 'bg-blue-100 text-blue-700', topic: 'Arrangements', time: '45m', badge: 'Next' },
  ];
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between">
        <Eyebrow>Today’s study plan</Eyebrow>
        <span className="text-[9px] font-bold text-emerald-600">0 of 3 done</span>
      </div>
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div key={r.topic} className={`rounded-xl border bg-white px-2 py-1.5 ${r.badge === 'Start Here' ? 'border-stone-300 shadow-sm' : 'border-stone-100'}`}>
            <div className="flex items-center gap-1.5">
              <span className={`rounded px-1.5 py-0.5 text-[7.5px] font-extrabold uppercase tracking-wide ${r.badge === 'Start Here' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'}`}>
                {r.badge}
              </span>
              <span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${r.chip}`}>{r.tag}</span>
              <span className="ml-auto text-[8.5px] font-bold text-stone-400">{r.time}</span>
            </div>
            <p className="mt-1 truncate text-[10px] font-bold text-stone-800">{r.topic}</p>
          </div>
        ))}
      </div>
      {/* The real home CTA, in the real words the app uses. */}
      <div className="mt-2 rounded-xl bg-stone-900 px-3 py-2 text-center">
        <p className="text-[10px] font-bold text-white">Update topics studied today →</p>
      </div>
      <div className="mt-1.5 flex items-center justify-between">
        <span className="text-[8.5px] font-semibold text-stone-400">about 2h</span>
        <span className="text-[9px] font-bold text-orange-500">🔥 12-day streak</span>
      </div>
    </div>
  );
}

// 4 — The loop: your update rebuilds today's plan.
//
// The product's actual differentiator and the newest thing in the app — the
// 0→100% rebuild the student watches after their daily update, then the
// because-line naming what changed. It was missing from the landing entirely.
// The because-line here is the shape plan-reason.ts really produces; keep it
// that way, and never write a preview claim the engine cannot make.
function ScreenRebuild() {
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>✓ Got your progress</Eyebrow>
      <div className="rounded-2xl border border-orange-100 bg-gradient-to-br from-orange-50 to-white p-3">
        <p className="text-[11px] font-extrabold leading-tight text-stone-900">Updating your study plan</p>
        <div className="mt-2 flex items-baseline gap-1">
          <span className="text-2xl font-extrabold leading-none tabular-nums text-stone-900">100</span>
          <span className="text-[11px] font-bold text-stone-400">%</span>
        </div>
        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-stone-200">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-orange-500 to-amber-500" />
        </div>
        <p className="mt-1.5 text-[9px] font-semibold text-stone-500">Setting your pace from here…</p>
      </div>
      <div className="mt-2 rounded-xl border border-orange-100 bg-orange-50 px-2.5 py-2">
        <p className="text-[9.5px] font-bold leading-snug text-stone-800">
          Geometry first — it didn’t get finished yesterday.
        </p>
      </div>
      <div className="mt-2 space-y-1">
        {[
          { n: '1', t: 'Geometry', m: '40m' },
          { n: '2', t: 'Reading Comp', m: '30m' },
          { n: '3', t: 'Arrangements', m: '45m' },
        ].map((r) => (
          <div key={r.t} className="flex items-center gap-2 rounded-lg border border-stone-100 bg-white px-2 py-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-[8px] font-bold text-white">{r.n}</span>
            <p className="flex-1 truncate text-[10px] font-bold text-stone-800">{r.t}</p>
            <span className="text-[8.5px] font-semibold text-stone-400">{r.m}</span>
          </div>
        ))}
      </div>
      <p className="mt-auto pt-1.5 text-center text-[8.5px] text-stone-400">Every update reshapes tomorrow</p>
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

// 7 — Daily Pick: today's top question, chosen by students.
//
// Live in the app since 29 Jul and absent from the landing page. Shown WITHOUT
// vote counts, exactly as the real surface does it — first votes herd later
// ones, and a preview that promises counts would misrepresent the product.
function ScreenDailyPick() {
  return (
    <div className="flex h-full flex-col">
      <Eyebrow>Daily Pick</Eyebrow>
      <div className="rounded-2xl border border-l-4 border-amber-200 border-l-amber-500 bg-gradient-to-br from-amber-50 to-white p-2.5">
        <span className="inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-white">
          🏆 Today’s Top Pick
        </span>
        <p className="mt-1.5 text-[10px] font-bold leading-snug text-stone-900">
          If 3 machines fill 600 bottles in 8 min, how many bottles do 5 fill in 12 min?
        </p>
        <ol className="mt-1 space-y-px text-[9px] leading-snug text-stone-600">
          <li>A. 1200</li><li>B. 1500</li><li>C. 1800</li>
        </ol>
        <p className="mt-1.5 text-[8px] text-stone-400">— Curated by CareerRai · a new pick every day</p>
      </div>
      <div className="mt-2 rounded-xl border border-l-4 border-stone-200 border-l-amber-400 bg-white p-2.5">
        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider text-amber-700">
          💡 Student tip
        </span>
        <p className="mt-1.5 text-[9.5px] leading-snug text-stone-800">
          In QA, plug the options in before solving algebraically.
        </p>
        <div className="mt-2 flex gap-1.5">
          <span className="flex-1 rounded-lg bg-amber-600 py-1 text-center text-[9px] font-bold text-white">👍 Yes, helpful</span>
          <span className="flex-1 rounded-lg bg-stone-100 py-1 text-center text-[9px] font-bold text-stone-500">👎 Not really</span>
        </div>
      </div>
      <p className="mt-auto pt-1.5 text-center text-[8.5px] text-stone-400">Students decide what gets featured</p>
    </div>
  );
}

const RENDER: Record<ScreenId, () => React.ReactElement> = {
  plan: ScreenPlan,
  rebuild: ScreenRebuild,
  syllabus: ScreenSyllabus,
  ontrack: ScreenOnTrack,
  coverage: ScreenCoverage,
  mock: ScreenMock,
  chat: ScreenChat,
  dailypick: ScreenDailyPick,
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
        {/* Descriptor for strangers — clarity in the first 3 seconds.
            The previous descriptor led with tracking and with the mentor, and
            argued AGAINST the product: a stranger hears more work for me, and
            the one paid thing is the first thing named. The promise is the
            opposite — the worrying is ours, the studying is theirs, and the six
            are free. (Quoting the old line verbatim here would trip the test
            below that forbids it; the same trap the "Three taps" guard hit.) */}
        <p className="mt-0.5 text-[11px] font-medium text-stone-400">You study. We plan everything else — free.</p>
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
            Build my CAT plan — free →
          </Link>
          {/* The six worries, compressed to one line. Founder, 8 Aug: "we
              solve UNCERTAINTY" — so the landing page names the uncertainty
              rather than listing features a stranger has seen on five other
              apps. Every item here ships today. */}
          <p className="px-1 text-center text-[11.5px] leading-relaxed text-stone-500">
            What to study today · what&apos;s left · what to revise and when · when to mock and when to
            analyse it · whether you&apos;ll finish in time · what happens on a bad day.
            <b className="text-stone-700"> None of it is your problem any more.</b>
          </p>
          <InstallButton variant="text" />
          {/* THE LOGIN DOOR. NEVER REMOVE IT, NEVER MAKE IT FINE PRINT.
              This page is the landing screen for EVERY logged-out arrival —
              root redirects here — and it shipped with no route to /login at
              all. The only button was the student signup funnel, so anyone
              who already has an account (a buddy on a new phone, a student
              whose session lapsed, a store reviewer holding demo credentials)
              was locked out of their own product.
              /start carries the same door in triplicate because an
              unreachable login is the Guideline 2.1 rejection we already took
              (Incident #10). /welcome was later placed IN FRONT of /start and
              never inherited the rule — this closes that gap. See #18. */}
          <Link
            href="/login"
            prefetch={false}
            className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-stone-300 bg-white py-3.5 text-[13px] font-semibold text-stone-700 transition-colors hover:border-stone-900 hover:text-stone-900"
          >
            Already have an account? <span className="underline underline-offset-2">Log in</span>
          </Link>
          <p className="text-center text-[11px] text-stone-400">Free to start · no credit card</p>
          {/* Public policy links. A payment provider or store reviewer lands
              here first, and previously had no route to pricing or policies —
              the paywall itself sits behind login. */}
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 pt-1 text-[11px] text-stone-400">
            <Link href="/pricing" className="hover:text-stone-600 hover:underline">Pricing</Link>
            <span aria-hidden>·</span>
            <Link href="/refunds" className="hover:text-stone-600 hover:underline">Refunds</Link>
            <span aria-hidden>·</span>
            <Link href="/terms" className="hover:text-stone-600 hover:underline">Terms</Link>
            <span aria-hidden>·</span>
            <Link href="/privacy" className="hover:text-stone-600 hover:underline">Privacy</Link>
            <span aria-hidden>·</span>
            <Link href="/contact" className="hover:text-stone-600 hover:underline">Contact</Link>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
}
