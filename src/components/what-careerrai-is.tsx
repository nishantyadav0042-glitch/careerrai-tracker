'use client';

import { cn } from '@/lib/utils';

// ── What CareerRai is, said once (24 Sep) ───────────────────────────────────
//
// Replaces the six-promises screen. Founder, 24 Sep, after the duplicate-
// education audit: the student's first question is "CareerRai actually hai
// kya? Main isko use karke CAT ki preparation kaise karunga?" The old screen
// answered it with six worries and "six jobs are ours" — our language, not
// theirs — and the same idea was then told again by the log practice, the app
// tour and the Home hint.
//
// This is now the ONE place the product is explained. Nothing after it
// explains it again: the Home card carries a single line, and the first real
// task teaches the rest.
//
// Headline (founder, 24 Sep): "You have the material. CareerRai decides the
// work." It answers the category question first: coaching teaches, books and
// mocks give practice, CareerRai decides what to do next.
//
// Every line is true of every student:
//   · the plan is sized by routine-engine from the hours asked on /start
//   · every engine task carries a reason and an estimate
//   · most tasks have no video, so the video is "some tasks", never "every"
//   · marking advances topic coverage; it does NOT promise tomorrow's plan
//     changes, because carry-over is not guaranteed by the engine
export const HOW_IT_WORKS: { head: string; body: string }[] = [
  { head: 'CareerRai plans', body: 'Every day: what to study, why it’s on today’s plan, and for how long. Sized to the study hours you told us.' },
  { head: 'You study', body: 'From your own book, notes or coaching material. Some tasks also have a free video.' },
  { head: 'You mark it', body: 'Come back and tap the task: Finished it or Got halfway. That’s all.' },
];

// The CTA is sticky, like every decision screen in the funnel (see
// funnel-cta.guard.test.ts): on the one screen that introduces the product,
// the way forward must never be something the student has to look for.
export function WhatCareerRaiIs({ onNext }: { onNext: () => void }) {
  return (
    <div className="space-y-3">
      <div className="text-center">
        <p className="text-[10px] font-bold uppercase tracking-widest text-orange-600">What is CareerRai</p>
        <h1 className="mt-1.5 text-[22px] font-bold leading-[1.15] text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          You have the material.<br />CareerRai decides the work.
        </h1>
        <p className="mx-auto mt-2 max-w-[19rem] text-[13px] leading-snug text-stone-600">
          CareerRai isn&apos;t a coaching app. You study from your own books, coaching, notes and videos.{' '}
          <b className="text-stone-900">CareerRai tells you what to do with them, every day.</b>
        </p>
      </div>

      <ol className="space-y-1.5">
        {HOW_IT_WORKS.map((s, i) => (
          <li key={s.head} className="flex gap-3 rounded-lg bg-stone-50 px-3 py-2.5">
            <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-900 text-[10px] font-bold text-white">
              {i + 1}
            </span>
            <div>
              <p className="text-[13.5px] font-bold leading-snug text-stone-900">{s.head}</p>
              <p className="mt-0.5 text-[12px] leading-snug text-stone-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      <p className="text-center text-[12px] leading-snug text-stone-500">
        CareerRai keeps track of what you&apos;ve covered. Your daily plan is free.
      </p>

      {/* Sticky: reachable at any scroll position, and clear of the iPhone
          home indicator. */}
      <div className="sticky bottom-0 z-20 bg-white/95 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <button
          type="button"
          onClick={onNext}
          className={cn(
            'w-full rounded-2xl bg-stone-900 py-3.5 text-[13.5px] font-semibold text-white',
            'transition-all hover:bg-stone-800 active:scale-[0.98]'
          )}
        >
          Got it →
        </button>
      </div>
    </div>
  );
}
