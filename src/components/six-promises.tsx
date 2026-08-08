'use client';

import { cn } from '@/lib/utils';

// The first thing a student sees when they open the app. Founder, 8 Aug:
// "tell loudly to the students what we help them and how we help them...
// this was such a blunder — we were solving everything daily" and never
// saying so.
//
// The blunder in one sentence: 96 students installed the app, opened it, saw
// a list of three tasks, and never logged once. A task list looks like work
// the student already knew they had. It never told them what we took OFF
// their plate. Unnamed value is invisible value.
//
// So this screen names all six jobs, says FREE loudly (the six are the free
// tier — a mentor is the only paid thing), and ends with the one job that is
// theirs. It replaces the hold-to-commit ceremony: a ritual asking the
// student for commitment, before we had shown them a single thing we do for
// them, was backwards.

// Only promises we can keep from day one. #5 said "we handle your mocks —
// what went wrong in it", and the cross-mock engine that finds repeat
// mistakes does not exist yet (founder caught this, 8 Aug). A promise the
// product can't keep on day 2 costs more than the promise wins on day 1 —
// same rule as the AI caller: say only what we can prove. Mock intelligence
// gets introduced at the moment a student uploads their first scorecard.
export const SIX_PROMISES: { n: string; head: string; sub: string }[] = [
  { n: '1', head: 'We make your plan', sub: 'From your coaching, your syllabus, your time.' },
  { n: '2', head: 'We tell you what to do today', sub: 'No deciding. Ever.' },
  { n: '3', head: 'We remember everything', sub: "Topics, weak areas, what's done, what's left." },
  { n: '4', head: 'We remind you to revise', sub: 'Before you forget it — not after.' },
  { n: '5', head: 'We fix the plan when life happens', sub: 'Miss a day and nothing breaks.' },
  { n: '6', head: 'We keep you on track', sub: 'Even after a bad week.' },
];

export function SixPromises({ onNext, ctaLabel = 'Turn on my reminders →' }: { onNext: () => void; ctaLabel?: string }) {
  return (
    <div className="space-y-5">
      <div className="text-center">
        <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">You&apos;re in</p>
        <h1 className="mt-1 text-[25px] font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Stop managing your<br />CAT preparation.
        </h1>
        <p className="mt-2 text-[17px] font-bold text-stone-900">
          You do one thing. <span className="text-orange-600">STUDY.</span>
        </p>
        <p className="mt-1 text-[15px] font-semibold text-stone-700">
          We&apos;ll handle the rest —{' '}
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

      {/* Where the hour actually goes. Specific beats round: a student who
          recognises their own evening in this list believes the rest. */}
      <div className="rounded-xl bg-stone-900 p-4 text-center">
        <p className="text-[13px] leading-relaxed text-white/85">
          Every day you lose about <b className="text-white">an hour</b> deciding what to study, planning and
          trying to remember what needs revision. After a mock, <b className="text-white">two more hours</b>{' '}
          analysing it.
        </p>
        <p className="mt-2 text-[13px] font-bold text-white">That&apos;s our job now. You just study.</p>
      </div>

      {/* Promise #4 and #6 are only keepable if we can reach them. So the ask
          is framed as us keeping our word, not as a permission request. */}
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
          Reminders are how we keep #4 and #6 — revision on time, and a nudge when you go quiet.
        </p>
        <p className="px-2 pt-1 text-center text-[11.5px] leading-snug text-stone-500">
          In coaching? <b className="text-stone-700">Send a photo of your timetable</b> in the app and we&apos;ll
          plan around your classes — saves you hours every week. Or do it later.
        </p>
      </div>
    </div>
  );
}
