'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { remainingPrepHours, type BlueprintPreviewInput } from '@/lib/blueprint-builder';
import { remainingMockHours } from '@/lib/study-pace';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  coveragePracticing: number | null;
  coverageLearning: number | null;
  coverageTotal: number | null;
  // Exam-scoped counts for the hours model; see blueprint-builder.
  coverageExamTotal?: number | null;
  coverageExamPracticing?: number | null;
  coverageExamLearning?: number | null;
  attemptYear: number | null;
  // The date the student picked at the very start (screen 2) — this screen
  // now reconciles that ambition against the real per-day cost.
  ambitionDate: string | null;
  // Effort inputs. A repeater's syllabus is genuinely smaller, so their date
  // options must be priced with the same multiplier Home uses.
  isRepeater: boolean | null;
  lastYearPercentile: number | null;
}

// The finish-date chooser — the commitment, not a setting (founder
// decision). Replaces the old abstract "how many hours do you have?"
// screen: hours are chosen HERE, with the date consequence of each option
// visible, computed from the coverage the student just declared. Same
// remainingPrepHours model as the live projection badge — one source of
// truth. Choosing an option sets BOTH the daily hours (feeds the routine
// engine) and the target date (owned deadline, shown on Home).
//
// CAT falls in late November; anything that lands after ~mid-November
// leaves no revision/mock buffer and is flagged, not offered.
const HOUR_OPTIONS: { hours: number; label: string; tone: string; toneActive: string }[] = [
  { hours: 4, label: 'Steady',     tone: 'border-teal-200 hover:border-teal-400',     toneActive: 'border-teal-500 bg-teal-50' },
  { hours: 6, label: 'Committed',  tone: 'border-orange-200 hover:border-orange-400', toneActive: 'border-orange-500 bg-orange-50' },
  { hours: 8, label: 'Aggressive', tone: 'border-rose-200 hover:border-rose-400',     toneActive: 'border-rose-500 bg-rose-50' },
];

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 86_400_000);
}

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

function toIsoDate(d: Date): string {
  return d.toISOString().split('T')[0];
}

export default function ScreenFinishDate({ onNext, onBack, canGoBack, isLoading, coveragePracticing, coverageLearning, coverageTotal, coverageExamTotal, coverageExamPracticing, coverageExamLearning, attemptYear, ambitionDate, isRepeater, lastYearPercentile }: Props) {
  const [selected, setSelected] = useState<number | 'custom' | null>(null);
  const [customDate, setCustomDate] = useState<string>('');

  // is_repeater + last_year_percentile are NOT decoration here: they set the
  // effort multiplier, so a repeater's date options are priced against their
  // real syllabus. Leave them out and this screen offers dates computed from
  // 397 hours while Home prices the same syllabus at 258 the next morning.
  const input: BlueprintPreviewInput = {
    coverage_practicing: coveragePracticing,
    coverage_learning: coverageLearning,
    coverage_total: coverageTotal,
    coverage_exam_total: coverageExamTotal,
    coverage_exam_practicing: coverageExamPracticing,
    coverage_exam_learning: coverageExamLearning,
    is_repeater: isRepeater,
    last_year_percentile: lastYearPercentile,
  };
  const syllabusLeft = remainingPrepHours(input);
  // Syllabus + mock budget (a full mock ≈ 4h incl. analysis) — the same
  // total the Home ring divides by days, so the promise made here is the
  // promise the app keeps tomorrow.
  const hoursLeft = syllabusLeft + remainingMockHours(syllabusLeft);
  const today = new Date();

  // CAT is late November of the attempt year; the syllabus must land well
  // before it. Options finishing after this cutoff aren't real plans.
  const examYear = attemptYear ?? today.getFullYear();
  const syllabusCutoff = new Date(examYear, 10, 10); // 10 November

  const dateForHours = (hoursPerDay: number): Date => addDays(today, Math.max(7, Math.ceil(hoursLeft / hoursPerDay)));

  // Custom date → required daily hours (the inverse), rounded UP to the
  // half hour so the plan never quietly under-provisions.
  const customDays = customDate ? Math.max(1, Math.round((Date.parse(customDate) - today.getTime()) / 86_400_000)) : null;
  const customRequired = customDays ? Math.ceil((hoursLeft / customDays) * 2) / 2 : null;
  const customUnrealistic = customRequired != null && customRequired > 10;

  const choose = (hours: number, finishDate: Date) => {
    onNext({
      studyTargetHours: hours,
      weekendHours: hours,
      syllabus_target_date: toIsoDate(finishDate),
    });
  };

  // Reconciliation: the ambition date from screen 2, now priced against the
  // topics they just declared. "You decided this date — here's what it
  // costs. Keep it or adjust."
  const ambition = ambitionDate ? new Date(ambitionDate + 'T00:00:00') : null;
  const ambitionDays = ambition ? Math.max(1, Math.round((ambition.getTime() - today.getTime()) / 86_400_000)) : null;
  const ambitionRequired = ambitionDays ? Math.ceil((hoursLeft / ambitionDays) * 2) / 2 : null;
  const ambitionUnrealistic = ambitionRequired != null && ambitionRequired > 10;

  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-bold text-stone-900">
          {ambition ? `You chose ${fmt(ambition)} to finish your CAT syllabus. Lock it with the real math.` : 'When do you want to finish your syllabus?'}
        </p>
      </div>

      <div className="space-y-2">
        {ambition && ambitionRequired != null && (
          <button
            type="button"
            disabled={isLoading || ambitionUnrealistic}
            onClick={() => choose(ambitionRequired, ambition)}
            className={cn(
              'w-full rounded-xl border-2 p-3.5 text-left transition-all active:scale-[0.98]',
              ambitionUnrealistic ? 'border-stone-200 opacity-60' : 'border-stone-800 bg-stone-50 hover:bg-stone-100'
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-stone-900">Keep {fmt(ambition)}</p>
              <p className="text-xs font-semibold text-stone-500">Your date</p>
            </div>
            <p className={cn('mt-0.5 text-sm font-semibold', ambitionUnrealistic ? 'text-rose-600' : 'text-stone-700')}>
              {ambitionUnrealistic
                ? `Needs ≈ ${ambitionRequired}h every day — not sustainable. Pick a pace below.`
                : `Needs ≈ ${ambitionRequired}h a day, every day`}
            </p>
          </button>
        )}
        {HOUR_OPTIONS.map(({ hours, label, tone, toneActive }) => {
          const finish = dateForHours(hours);
          const afterCutoff = finish > syllabusCutoff;
          return (
            <button
              key={hours}
              type="button"
              disabled={isLoading || afterCutoff}
              onClick={() => { setSelected(hours); choose(hours, finish); }}
              className={cn(
                'w-full rounded-xl border-2 p-3.5 text-left transition-all active:scale-[0.98]',
                afterCutoff ? 'border-stone-200 opacity-50' : selected === hours ? toneActive : `bg-white ${tone}`
              )}
            >
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-sm font-bold text-stone-900">{hours} self-study hours / day</p>
                <p className="text-xs font-semibold text-stone-500">{label}</p>
              </div>
              <p className={cn('mt-0.5 text-sm font-semibold', afterCutoff ? 'text-rose-600' : 'text-stone-700')}>
                {afterCutoff
                  ? `Finishes past ${fmt(syllabusCutoff)} — too late before CAT ${examYear}`
                  : `Syllabus done by ${fmt(finish)}`}
              </p>
            </button>
          );
        })}

        {/* My own date → shows the required daily hours before committing. */}
        <div
          className={cn(
            'rounded-xl border-2 p-3.5 transition-all',
            selected === 'custom' ? 'border-stone-800 bg-stone-50' : 'border-stone-200 bg-white'
          )}
        >
          <button type="button" className="w-full text-left" onClick={() => setSelected('custom')}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="text-sm font-bold text-stone-900">📅 My own date</p>
              <p className="text-xs font-semibold text-stone-500">You set it, we price it</p>
            </div>
          </button>
          {selected === 'custom' && (
            <div className="mt-3 space-y-2">
              <input
                type="date"
                value={customDate}
                min={toIsoDate(addDays(today, 7))}
                max={toIsoDate(syllabusCutoff)}
                onChange={(e) => setCustomDate(e.target.value)}
                className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm text-stone-900"
              />
              {customRequired != null && (
                <p className={cn('text-xs font-semibold', customUnrealistic ? 'text-rose-600' : 'text-stone-700')}>
                  {customUnrealistic
                    ? `That date needs ≈ ${customRequired}h every day — not a sustainable plan. Pick a later date.`
                    : `This date needs ≈ ${customRequired}h a day, every day. Still choose it?`}
                </p>
              )}
              {customRequired != null && !customUnrealistic && (
                <button
                  type="button"
                  disabled={isLoading}
                  onClick={() => choose(customRequired, new Date(customDate + 'T00:00:00'))}
                  className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
                >
                  Yes — {customRequired}h/day until {fmt(new Date(customDate + 'T00:00:00'))} →
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {canGoBack && (
        <button onClick={onBack} disabled={isLoading} className="w-full py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
          Back
        </button>
      )}
    </div>
  );
}
