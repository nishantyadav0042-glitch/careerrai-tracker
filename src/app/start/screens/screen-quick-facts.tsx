'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { FLOOR_OPTIONS_MINUTES } from '@/lib/daily-hours';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  ambitionDate?: string; // kept in the flow; the pace check now happens in-app once target hours are set
}

// Stage A (founder, 8 Aug): the signup hours question is gone. It collected
// fantasy — students chose 11–15h/day, did 2–6h, and the plan built at the
// fantasy stood as daily proof of failure until they left (churn cohort,
// 8 Aug). We now ask for the FLOOR: the minimum that survives a bad day. The
// daily plan is built at that size, so finishing it is normal; "want more?"
// lives in the app. Target hours (for pace and the finish-date math) are
// asked on day 2–3, after the student has felt one winnable day — and THAT
// is where the date-feasibility conversation moved too.

const FLOOR_LABELS: Record<number, string> = { 15: '15 min', 30: '30 min', 60: '1 hour', 120: '2 hours' };

// Self-study hours on a NORMAL day. Founder, 8 Aug: "self study hours तो
// हमें पूछने ही पड़ेंगे ना, चाहे repeater हो चाहे fresher — इसके अलावा timed
// study plan कैसे बना पाओगे? हो सकता है आप बिना पूछे दस घंटे का बना दोगे."
//
// This number was removed from signup this morning because it was fantasy:
// students chose 11–15h and did 2–6h. What made it dangerous was that it
// SIZED THE DAILY PLAN — the fantasy became a 750-minute list and daily proof
// of failure. That link is now cut: the floor sizes the day. So this number
// only drives pace and the finish date, where being wrong is corrected every
// Sunday by logged evidence rather than shouted at the student every morning.
//
// Asked SECOND, after the floor, on purpose. "On a bad day, 30 minutes"
// anchors low, and an honest anchor produces an honest normal-day answer.
// The ceiling stays 16 (lib/daily-hours): a student who genuinely does 12
// hours may say 12 — the app holds the number, it doesn't judge it.
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
  const [floor, setFloor] = useState<number | null>(null);
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
    floor != null && selfStudyHours != null && coaching != null && repeater != null && situation != null && repeaterQuestionsValid;
  const payload = {
    // The normal-day number. Drives pace, the finish date and the Sunday
    // reconcile — NOT the size of today's plan, which the floor owns.
    self_study_hours: selfStudyHours,
    // Pre-signup blob, not a profile write — verify-phone-otp replays it
    // through setBadDayFloor once the account actually exists. Named
    // bad_day_floor (not the column) so lib/daily-hours stays the only file
    // that ever spells the column name in a write.
    bad_day_floor: floor,
    coaching_enrolled: coaching, is_repeater: repeater, is_working_professional: situation === 'working',
    last_year_percentile: repeater ? parsedLastYearPercentile : null,
    had_buddy_last_year: repeater ? hadBuddyLastYear : null,
  };

  return (
    <div className="space-y-6 pt-1">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          A few quick facts.
        </h1>
        {/* This said "Three taps" for weeks after it started asking four
            questions — true the day it was written, false ever since. A screen
            that miscounts itself in the first two seconds is a bad opener, so
            the number is now pinned by a test (screen-quick-facts.test.ts)
            that counts the question headings and fails if they disagree. */}
        <p className="mt-1.5 text-sm text-stone-500">Five taps — this is what shapes your daily plan.</p>
      </div>

      <div>
        <p className="mb-1 text-sm font-semibold text-stone-800">On a bad day, how much can you still do?</p>
        <p className="mb-2 text-xs text-stone-500">Your daily plan is built to this — small enough to finish even on your worst day. Good days get more.</p>
        <div className="flex flex-wrap gap-2">
          {FLOOR_OPTIONS_MINUTES.map((m) => (
            <Chip key={m} active={floor === m} label={FLOOR_LABELS[m]} onClick={() => setFloor(m)} />
          ))}
        </div>
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
            Got your coaching&apos;s weekly timetable? Send a photo inside the app and your daily plan
            follows your classes — or we&apos;ll build it with you. You can do this any time.
          </p>
        )}
      </div>

      {/* Asked after coaching so the question can name the right thing. For a
          coaching student "6 hours" is ambiguous — 6 including class, or 6 on
          top of it? Plan the same day for both and one of them is wrong by
          three hours (founder, 8 Aug: "जो हम घंटे पूछ रहे हैं वह self study
          hours पूछ रहे हैं"). */}
      <div>
        <p className="mb-1 text-sm font-semibold text-stone-800">
          {coaching === true ? 'Outside class, how much do you study on a normal day?' : 'On a normal day, how much do you study?'}
        </p>
        <p className="mb-2 text-xs text-stone-500">
          {coaching === true
            ? 'Self-study only — not counting your coaching hours. Answer honestly, not ambitiously: this sets your finish date, and we check it against what you actually log.'
            : 'Answer honestly, not ambitiously. This sets your finish date, and we check it against what you actually log.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {HOURS_OPTIONS.map((h) => (
            <Chip
              key={h}
              active={selfStudyHours === h}
              label={h === 12 ? '12+ hrs' : h === 1 ? '1 hr' : `${h} hrs`}
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
        <div className="flex flex-wrap gap-2">
          <Chip active={situation === 'working'} label="Working professional" onClick={() => setSituation('working')} />
          <Chip active={situation === 'college'} label="College student" onClick={() => setSituation('college')} />
          <Chip active={situation === 'fulltime'} label="Full-time aspirant" onClick={() => setSituation('fulltime')} />
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
