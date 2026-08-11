'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  ambitionDate?: string; // kept in the flow; the pace check now happens in-app once target hours are set
}

// Self-study hours on a NORMAL day — the one number this screen exists for.
// Founder, 8 Aug: we have to ask for self-study hours, repeater or fresher —
// without them, how would you ever build a timed study plan?
//
// A bad-day FLOOR question lived here for about six hours and is gone. It
// asked a student to predict, three weeks ahead, how bad their worst day
// would be, then fought with this number over which one sized the plan —
// and that fight produced both of the day's real bugs. A heavy day is
// answered when it happens instead: the Busy day button, which moves today's
// work and the finish date one day forward. One number, one owner.
//
// The churn risk this number carries is real (students chose 11–15h and did
// 2–6h) and is answered three ways rather than by a second number: the
// question names self-study only, the screen says "honestly, not
// ambitiously", and every Sunday the reconcile corrects the date against what
// was actually logged. The ceiling stays 16 — a student who genuinely does 12
// hours may say 12. The app holds the number, it doesn't judge it.
const HOURS_OPTIONS = [1, 2, 3, 4, 5, 6, 8, 10, 12] as const;

function Chip({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all active:scale-95',
        active ? 'border-stone-900 bg-stone-900 text-white' : 'border-stone-300 bg-white text-stone-700 hover:border-stone-900'
      )}
    >
      {label}
    </button>
  );
}

type Situation = 'working' | 'college' | 'fulltime';

export default function ScreenQuickFacts({ onNext, onBack, canGoBack, isLoading }: Props) {
  const [selfStudyHours, setSelfStudyHours] = useState<number | null>(null);
  const [coaching, setCoaching] = useState<boolean | null>(null);
  const [repeater, setRepeater] = useState<boolean | null>(null);
  const [situation, setSituation] = useState<Situation | null>(null);
  // Repeater-only (founder, 23 Jul): asked of every repeater, right here.
  // Feeds the buddy-pitch screen that follows, for repeaters only.
  const [lastYearPercentile, setLastYearPercentile] = useState<string>('');
  const [hadBuddyLastYear, setHadBuddyLastYear] = useState<boolean | null>(null);

  const parsedLastYearPercentile = parseFloat(lastYearPercentile);
  const lastYearPercentileValid =
    lastYearPercentile.trim() !== '' &&
    !isNaN(parsedLastYearPercentile) &&
    parsedLastYearPercentile >= 0 &&
    parsedLastYearPercentile <= 99.99;
  const repeaterQuestionsValid = repeater !== true || (lastYearPercentileValid && hadBuddyLastYear !== null);

  const canContinue =
    selfStudyHours != null && coaching != null && repeater != null && situation != null && repeaterQuestionsValid;
  const payload = {
    // THE number. It sizes the daily plan, sets the finish date, and is what
    // the Sunday reconcile checks against what was actually logged. There is
    // no second number any more — see lib/daily-hours.
    self_study_hours: selfStudyHours,
    coaching_enrolled: coaching, is_repeater: repeater, is_working_professional: situation === 'working',
    last_year_percentile: repeater ? parsedLastYearPercentile : null,
    had_buddy_last_year: repeater ? hadBuddyLastYear : null,
  };

  return (
    <div className="space-y-5 pt-1">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          A few quick facts.
        </h1>
        {/* This said "Three taps" for weeks after it started asking four
            questions — true the day it was written, false ever since. A screen
            that miscounts itself in the first two seconds is a bad opener, so
            the number is now pinned by a test (screen-quick-facts.test.ts)
            that counts the question headings and fails if they disagree. */}
        <p className="mt-1 text-sm text-stone-500">Four taps — this is what shapes your daily plan.</p>
      </div>


      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">Coaching</p>
        <div className="flex gap-2">
          <Chip active={coaching === true} label="Enrolled" onClick={() => setCoaching(true)} />
          <Chip active={coaching === false} label="Self-prep" onClick={() => setCoaching(false)} />
        </div>
        {/* A hint, not a step (founder, 8 Aug): a coaching student should know
            the photo shortcut exists from the moment they say "enrolled", but
            uploading now would stall signup on finding a sheet they may not
            have to hand. The ask comes properly on day 1 in the app. */}
        {coaching === true && (
          <p className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-[12.5px] leading-snug text-stone-600">
            Got your coaching timetable? Photograph it in the app later and your daily plan will
            follow your classes.
          </p>
        )}
      </div>

      {/* Asked after coaching so the question can name the right thing. For a
          coaching student "6 hours" is ambiguous — 6 including class, or 6 on
          top of it? Plan the same day for both and one of them is wrong by
          three hours. Founder, 8 Aug: the hours we ask for are SELF-STUDY
          hours. */}
      <div>
        <p className="mb-1 text-sm font-semibold leading-snug text-stone-800">
          {coaching === true ? 'Outside class, how much do you study on a normal day?' : 'On a normal day, how much do you study?'}
        </p>
        <p className="mb-2 text-xs leading-snug text-stone-500">
          {coaching === true
            ? 'Self-study only, not counting your coaching hours. Answer honestly — this sets your finish date.'
            : 'Answer honestly, not ambitiously — this sets your finish date.'}
        </p>
        {/* A fixed 5-up grid, not flex-wrap. Nine "3 hrs"-width chips wrapped
            to three ragged rows on a 360px phone and were most of the reason
            Continue sat below the fold here. Same nine choices, two tidy rows,
            and the unit is already in the question above. */}
        <div className="grid grid-cols-5 gap-2">
          {HOURS_OPTIONS.map((h) => (
            <Chip
              key={h}
              active={selfStudyHours === h}
              label={h === 12 ? '12+h' : `${h}h`}
              onClick={() => setSelfStudyHours(h)}
            />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">CAT attempt</p>
        <div className="flex gap-2">
          <Chip active={repeater === false} label="First attempt" onClick={() => setRepeater(false)} />
          <Chip active={repeater === true} label="Repeating" onClick={() => setRepeater(true)} />
        </div>
      </div>

      {repeater === true && (
        <div className="space-y-4 rounded-2xl border border-stone-300 bg-stone-50 p-4">
          <div>
            <p className="mb-2 text-sm font-semibold text-stone-800">What was your percentile last year?</p>
            <div className="relative">
              <input
                type="number"
                min={0}
                max={99.99}
                step={0.01}
                placeholder="e.g. 82.5"
                value={lastYearPercentile}
                onChange={(e) => setLastYearPercentile(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-stone-300 text-stone-900 text-base font-medium focus:outline-none focus:ring-2 focus:ring-stone-400 appearance-none"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
            </div>
            {lastYearPercentile.trim() !== '' && !lastYearPercentileValid && (
              <p className="text-xs text-red-600 mt-1">Enter a percentile between 0 and 99.99.</p>
            )}
          </div>
          <div>
            <p className="mb-2 text-sm font-semibold text-stone-800">Did you have a buddy or guide last year — someone who has actually cracked CAT?</p>
            <div className="flex gap-2">
              <Chip active={hadBuddyLastYear === true} label="Yes, I did" onClick={() => setHadBuddyLastYear(true)} />
              <Chip active={hadBuddyLastYear === false} label="No, I was alone" onClick={() => setHadBuddyLastYear(false)} />
            </div>
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">Right now you&apos;re a…</p>
        {/* Short labels in a 3-up grid. "Working professional / College student
            / Full-time aspirant" each took a full row on a 360px phone — three
            rows for one question. The stored values are unchanged; only the
            words on the chip are shorter, and the question above already
            supplies the noun. */}
        <div className="grid grid-cols-3 gap-2">
          <Chip active={situation === 'working'} label="Working" onClick={() => setSituation('working')} />
          <Chip active={situation === 'college'} label="College" onClick={() => setSituation('college')} />
          <Chip active={situation === 'fulltime'} label="Full-time" onClick={() => setSituation('fulltime')} />
        </div>
      </div>

      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {canGoBack && (
          <button onClick={onBack} disabled={isLoading} className="flex-1 rounded-xl border border-stone-300 py-3 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50">
            Back
          </button>
        )}
        <button
          onClick={() => canContinue && onNext(payload)}
          disabled={!canContinue || isLoading}
          className={cn(
            'flex-1 rounded-xl py-3 text-sm font-semibold transition-all active:scale-[0.98]',
            canContinue ? 'bg-stone-900 text-white hover:bg-stone-800' : 'cursor-not-allowed bg-stone-200 text-stone-400'
          )}
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
