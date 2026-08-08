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

// The six worries, in the words CAT students actually use.
//
// Founder, 8 Aug: too long, and the design was heavy. "Keep it simple — which
// is the go-to language of CAT students in class, in coaching, during prep."
//
// Two things fixed. First, "Don't worry about" was repeated six times, which is
// what made it long; it is said ONCE in the heading and the six become short
// nouns. Second, the vocabulary is theirs, not ours: BACKLOG, not "what is
// left". GIVE a mock, not "take" one. OFF DAY, not "a bad day". PORTION and
// SYLLABUS, not "coverage". A student who reads their own coaching's words
// believes the screen; a student who reads product language reads an ad.
//
// Every line maps to something that ships:
//   1 daily plan · 2 topic coverage · 3 revision cadence
//   4 mock calendar + analysis slot · 5 feasibility verdict · 6 busy day
export const SIX_PROMISES: { n: string; head: string; sub: string }[] = [
  { n: '1', head: 'What to study today', sub: 'Ready before you wake up' },
  { n: '2', head: 'Your backlog', sub: 'All 46 topics, tracked' },
  { n: '3', head: 'Revision', sub: 'What to revise, and when' },
  { n: '4', head: 'Mocks', sub: 'When to give one. When to analyse it.' },
  { n: '5', head: 'Syllabus finishing in time', sub: 'Checked every week' },
  { n: '6', head: 'Off days', sub: 'Plan shifts. Nothing lost.' },
];

export function SixPromises({ onNext, ctaLabel = 'Turn on my reminders →' }: { onNext: () => void; ctaLabel?: string }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">You&apos;re in</p>
        <h1 className="mt-1 text-[26px] font-bold leading-[1.15] text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Stop worrying about<br />your preparation.
        </h1>
        <p className="mt-2.5 text-[17px] font-bold text-stone-900">
          You do one thing. <span className="text-orange-600">STUDY.</span>
        </p>
        <p className="mt-1 text-[15px] font-semibold text-stone-700">
          We plan all of it —{' '}
          <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 font-bold text-emerald-700">100% FREE</span>
        </p>
      </div>

      {/* LOUD by choice (founder: "last one was better and loud") — numbered,
          bordered, one worry per block, so six items land as six weights being
          lifted rather than a quiet checklist. The LANGUAGE stays short and in
          the student's own words; the two notes were about different things,
          and the loud layout is what carries a claim on a first open. */}
      <ol className="space-y-2.5">
        {SIX_PROMISES.map((p) => (
          <li key={p.n} className="flex gap-3 rounded-xl border border-stone-200 bg-white p-3">
            <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-stone-900 text-[11px] font-bold text-white">
              {p.n}
            </span>
            <div className="min-w-0">
              <p className="text-[14.5px] font-bold leading-snug text-stone-900">{p.head}</p>
              <p className="text-[12.5px] leading-snug text-stone-500">{p.sub}</p>
            </div>
          </li>
        ))}
      </ol>

      {/* Name the enemy, in their word for it. */}
      <div className="rounded-xl bg-stone-900 p-4 text-center">
        <p className="text-[13.5px] leading-relaxed text-white/85">
          The hard part was never the <b className="text-white">padhai</b>. It&apos;s the{' '}
          <b className="text-white">not knowing</b> — am I on track, what did I forget, will I finish.
        </p>
        <p className="mt-2 text-[13.5px] font-bold text-white">All six are ours now. You just study.</p>
      </div>

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
        <p className="px-2 text-center text-[11.5px] leading-snug text-stone-400">
          That&apos;s how revision reaches you on time, and your mock on the day it&apos;s due.
        </p>
        <p className="px-2 pt-1 text-center text-[12px] leading-snug text-stone-500">
          In coaching? <b className="text-stone-700">Send your timetable photo</b>{' '}
          — we&apos;ll plan around your classes. Later is fine.
        </p>
      </div>
    </div>
  );
}
