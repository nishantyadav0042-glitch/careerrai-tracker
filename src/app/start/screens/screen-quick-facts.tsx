'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { computeFeasibility, type Feasibility } from '@/lib/syllabus-feasibility';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  ambitionDate?: string; // the finish date they picked two screens ago
}

// CAT aspirants range from working pros squeezing in an hour to full-time
// droppers doing 10-12h — the options must cover both ends honestly.
const HOURS = [1, 2, 3, 4, 6, 8, 10, 12];

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

// Three fast facts, one screen, no essay questions — coaching status,
// attempt history, and daily hours available all in one quick tap-through.
type Situation = 'working' | 'college' | 'fulltime';

export default function ScreenQuickFacts({ onNext, onBack, canGoBack, isLoading, ambitionDate }: Props) {
  const [hours, setHours] = useState<number | null>(null);
  const [coaching, setCoaching] = useState<boolean | null>(null);
  const [repeater, setRepeater] = useState<boolean | null>(null);
  const [situation, setSituation] = useState<Situation | null>(null);
  const [alert, setAlert] = useState<Feasibility | null>(null);
  // Repeater-only (founder, 23 Jul): asked of every repeater, right here —
  // this IS the commitment screen (hours pledge). Feeds the buddy-pitch
  // screen that follows, for repeaters only.
  const [lastYearPercentile, setLastYearPercentile] = useState<string>('');
  const [hadBuddyLastYear, setHadBuddyLastYear] = useState<boolean | null>(null);

  const parsedLastYearPercentile = parseFloat(lastYearPercentile);
  const lastYearPercentileValid =
    lastYearPercentile.trim() !== '' &&
    !isNaN(parsedLastYearPercentile) &&
    parsedLastYearPercentile >= 0 &&
    parsedLastYearPercentile <= 99.99;
  const repeaterQuestionsValid = repeater !== true || (lastYearPercentileValid && hadBuddyLastYear !== null);

  const canContinue = hours != null && coaching != null && repeater != null && situation != null && repeaterQuestionsValid;
  // Identity Engine: 'working' is the persona that most reshapes the plan
  // (scarce time → highest-ROI, lighter weekdays). College / full-time both
  // read as not-working-professional for now.
  const payload = {
    hours_available: hours, coaching_enrolled: coaching, is_repeater: repeater, is_working_professional: situation === 'working',
    last_year_percentile: repeater ? parsedLastYearPercentile : null,
    had_buddy_last_year: repeater ? hadBuddyLastYear : null,
  };

  // The capacity reality-check: does their finish date fit the hours they can
  // give? If not, STOP and show it boldly — they decide, we never silently hand
  // over an impossible plan.
  function attemptContinue() {
    if (!canContinue) return;
    const f = computeFeasibility(ambitionDate, hours);
    if (f && !f.feasible) { setAlert(f); return; }
    onNext(payload);
  }

  if (alert) {
    return (
      <div className="space-y-5 pt-1">
        <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-5">
          <p className="text-[11px] font-bold uppercase tracking-widest text-red-600">⚠ Reality check</p>
          <h1 className="mt-1.5 text-xl font-bold leading-snug text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            This date and your hours won&apos;t work together.
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-stone-700">
            The full CAT syllabus needs about <b>{alert.totalHours} focused hours</b>. To finish by <b>{new Date(ambitionDate + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' })}</b> that&apos;s
            {' '}<b className="text-red-600">{alert.requiredHoursPerDay}h every single day</b> — but you can give <b>{alert.hoursPerDay}h</b>.
          </p>
          <p className="mt-2 text-sm leading-relaxed text-stone-700">
            An impossible date is the #1 reason serious students quietly quit. A date you actually hit beats a date that looks good and breaks you.
          </p>
          {alert.afterExam && (
            <p className="mt-2 rounded-lg bg-white px-3 py-2 text-[13px] font-semibold text-red-700">
              Heads up: even at your pace, finishing lands after CAT — you&apos;d need to raise your hours to be exam-ready in time.
            </p>
          )}
        </div>

        <div className="space-y-2">
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onNext({ ...payload, ambition_date: alert.realisticDateIso })}
            className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
          >
            Move my date to {alert.realisticDateLabel} — this fits my {alert.hoursPerDay}h →
          </button>
          <button
            type="button"
            disabled={isLoading}
            onClick={() => onNext(payload)}
            className="w-full rounded-2xl border border-stone-300 bg-white py-3.5 text-sm font-medium text-stone-600 transition-colors hover:bg-stone-50"
          >
            Keep my ambitious date anyway
          </button>
          <button
            type="button"
            onClick={() => setAlert(null)}
            className="w-full py-2 text-xs font-medium text-stone-400 hover:text-stone-600"
          >
            ← Change my hours
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pt-1">
      <div>
        <h1 className="text-xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          A few quick facts.
        </h1>
        <p className="mt-1.5 text-sm text-stone-500">Three taps — this is what shapes your daily routine.</p>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">Hours you can give daily</p>
        <div className="flex flex-wrap gap-2">
          {HOURS.map((h) => (
            <Chip key={h} active={hours === h} label={`${h}h`} onClick={() => setHours(h)} />
          ))}
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-stone-800">Coaching</p>
        <div className="flex gap-2">
          <Chip active={coaching === true} label="Enrolled" onClick={() => setCoaching(true)} />
          <Chip active={coaching === false} label="Self-prep" onClick={() => setCoaching(false)} />
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
          onClick={attemptContinue}
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
