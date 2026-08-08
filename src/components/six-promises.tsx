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

export function SixPromises({ onNext, ctaLabel = 'Got it — start my plan →' }: { onNext: () => void; ctaLabel?: string }) {
  return (
    <div className="space-y-5">
      {/* This screen answers ONE question — what is CareerRai — and asks for
          nothing. It used to end in "Turn on my reminders", which quietly made
          the six a wrapper around a permission prompt; a student who senses
          they are being softened up stops reading the six. Permission is the
          NEXT step, with its own reason. Founder, 8 Aug: "not like this, as 6
          things hidden as notifications permission. It should be next step." */}
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-orange-600">What is CareerRai</p>
        <h1 className="mt-2 text-[27px] font-bold leading-[1.12] text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Six jobs are ours.<br />One job is yours.
        </h1>

        {/* THE claim. Founder: "we have to tell them we are giving you your one
            hour back daily." Said before the list, because it is the reason
            the list matters. */}
        <div className="mx-auto mt-3.5 max-w-[19rem] rounded-2xl bg-orange-50 px-4 py-3">
          <p className="text-[15px] font-bold leading-snug text-stone-900">
            That&apos;s about <span className="text-orange-600">1 hour of your day</span>, back.
          </p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-stone-600">
            Every day. The planning, the remembering, the deciding — gone.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 px-0.5 text-[11px] font-bold uppercase tracking-widest text-stone-400">
          Ours — never your problem again
        </p>
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
      </div>

      {/* The one job, given the same weight as the six. This is the trade, and
          it is the whole positioning: six to one. */}
      <div className="rounded-xl bg-stone-900 p-4 text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-white/40">Yours</p>
        <p className="mt-1.5 text-[22px] font-bold leading-none text-white">Study.</p>
        <p className="mt-2.5 text-[13px] leading-relaxed text-white/75">
          That&apos;s it. The hard part was never the <b className="text-white">padhai</b> — it&apos;s the{' '}
          <b className="text-white">not knowing</b>. Am I on track, what did I forget, will I finish.
        </p>
        <p className="mt-2.5 inline-block rounded-md bg-emerald-500/15 px-2.5 py-1 text-[12.5px] font-bold text-emerald-300">
          All six, 100% free
        </p>
      </div>

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
    </div>
  );
}
