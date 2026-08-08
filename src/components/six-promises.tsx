'use client';

import { cn } from '@/lib/utils';

// The first thing a student sees when they open the app.
//
// The blunder this fixes, in one sentence: 96 students installed, opened the
// app, saw a list of three tasks, and never logged once. A task list looks
// like work the student already knew they had. It never told them what we
// took OFF their plate. Unnamed value is invisible value.
//
// FREE is said loudly because the six ARE the free tier — a mentor is the
// only paid thing, and saying "free" without that boundary would be a
// bait-and-switch the moment they meet the mentor price.

// The six things a CAT aspirant actually worries about — answered as "don't
// worry about it", because that is the product.
//
// Founder, 8 Aug, correcting me: "you are claiming different pain points, or
// ones students don't even really care about. We solve UNCERTAINTY."
//
// He is right and the difference is not cosmetic. "We make your plan" is a
// feature; a student reads it and thinks "fine, another planner". "Don't worry
// about what to revise and when" names a thing they lie awake about. The first
// sells software. The second removes a weight.
//
// Every line here maps to something that actually ships, in this order:
//   1  daily plan (routine-engine)          4  mock calendar + analysis slot
//   2  46-topic coverage + hours left       5  feasibility verdict, honest
//   3  per-topic revision cadence           6  busy day shifts the plan
//
// Nothing is listed that we cannot do today. The mock-analysis line only became
// sayable this evening, when the analysis block got its own place in the plan.
export const SIX_PROMISES: { n: string; head: string; sub: string }[] = [
  { n: '1', head: "Don't worry about what to study today", sub: "It's decided before you wake up." },
  { n: '2', head: "Don't worry about what's left", sub: 'All 46 topics tracked. You never hold it in your head.' },
  { n: '3', head: "Don't worry about what to revise, or when", sub: 'We bring it back before you forget it.' },
  { n: '4', head: "Don't worry about mocks", sub: 'When to take one, and when to analyse it — both on your plan.' },
  { n: '5', head: "Don't worry about finishing in time", sub: 'We do the maths every week and tell you the truth.' },
  { n: '6', head: "Don't worry about a bad day", sub: 'Say you were busy. Everything moves. Nothing is lost.' },
];

export function SixPromises({ onNext, ctaLabel = 'Turn on my reminders →' }: { onNext: () => void; ctaLabel?: string }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">You&apos;re in</p>
        <h1 className="mt-1 text-[25px] font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Stop worrying about<br />your preparation.
        </h1>
        <p className="mt-2 text-[17px] font-bold text-stone-900">
          You do one thing. <span className="text-orange-600">STUDY.</span>
        </p>
        <p className="mt-1 text-[15px] font-semibold text-stone-700">
          We plan all of it —{' '}
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">100% FREE</span>
        </p>
      </div>

      <ol className="space-y-2.5">
        {SIX_PROMISES.map((p) => (
          <li key={p.n} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-900 text-[11px] font-bold text-white">
              {p.n}
            </span>
            <div className="min-w-0">
              <p className="text-[14px] font-bold leading-snug text-stone-900">{p.head}</p>
              <p className="text-[12.5px] leading-snug text-stone-500">{p.sub}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Name the real enemy. A student who recognises their own 2am in this
          sentence believes the six lines above it. */}
      <div className="rounded-xl bg-stone-900 p-4 text-center">
        <p className="text-[13px] leading-relaxed text-white/85">
          The hard part of CAT was never the studying. It is the{' '}
          <b className="text-white">not knowing</b> — am I on track, what have I forgotten, is this
          enough, will I finish.
        </p>
        <p className="mt-2 text-[13px] font-bold text-white">
          Every one of those is answered here, with your own numbers. You just study.
        </p>
      </div>

      {/* Two of the six are only keepable if we can reach them, so the ask is
          framed as us keeping our word rather than as a permission request. */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={onNext}
          className={cn(
            'w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white',
            'transition-all hover:bg-stone-800 active:scale-[0.98]'
          )}
        >
          {ctaLabel}
        </button>
        <p className="px-2 text-center text-[11px] leading-snug text-stone-400">
          Reminders are how we keep #3 and #4 — revision before you forget, and your mock on the day it is due.
        </p>
        <p className="px-2 pt-1 text-center text-[11.5px] leading-snug text-stone-500">
          In coaching? <b className="text-stone-700">Send a photo of your timetable</b>{' '}
          in the app and we&apos;ll plan around your classes — saves you hours every week. Or do it later.
        </p>
      </div>
    </div>
  );
}
