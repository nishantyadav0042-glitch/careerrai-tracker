'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

// The whole plan, scrollable.
//
// Founder, 8 Aug: "Give them an option to check out their whole plan till CAT
// day. Sometimes you just want to see what your next fifteen days look like."
//
// Three things this screen must never do, each learned the hard way in this
// codebase: invent a topic it cannot know, show a number that disagrees with
// Home, or hide a date that cannot be hit. So every figure comes from
// /api/plan/full, which is built from the same engines the daily plan uses,
// and the feasibility verdict is printed at the top whether it is good news
// or not.

interface Check { id: string; label: string; status: string; detail: string; items?: string[] }
interface Integrity { checks: Check[]; passed: boolean; unscheduledTopics: string[] }
interface PlanItem { kind: string; label: string; section: string | null; hours: number }
interface PlanDay { date: string; phase: string; items: PlanItem[]; totalHours: number; isMockDay: boolean }
interface Payload {
  days: PlanDay[];
  examDate: string;
  mockCount: number;
  verdict: string;
  horizonReason: string;
  integrity: Integrity;
  feasibility: { fits: boolean; totalHours: number; mockHours: number; daysToExam: number };
}

const PHASE_LABEL: Record<string, string> = {
  build: 'Building the syllabus',
  intensive: 'Intensive — mocks twice a week',
  revision: 'Revision only — no new topics',
};

const KIND_STYLE: Record<string, string> = {
  mock: 'bg-orange-100 text-orange-800',
  mock_analysis: 'bg-amber-50 text-amber-800',
  revision: 'bg-violet-50 text-violet-800',
  topic: 'bg-stone-100 text-stone-700',
};

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  });
}

export function FullPlanView() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Fifteen days is the founder's own example of what a student wants to see,
  // and it is a real answer rather than an infinite scroll nobody reaches the
  // end of. The rest is one tap away.
  const [limit, setLimit] = useState(15);

  useEffect(() => {
    fetch('/api/plan/full')
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : setData(j)))
      .catch(() => setError('Could not load your plan.'));
  }, []);

  if (error) return <p className="p-4 text-sm text-stone-500">{error}</p>;
  if (!data) return <p className="p-4 text-sm text-stone-400">Building your plan…</p>;

  const shown = data.days.slice(0, limit);
  let lastPhase = '';
  const MARK: Record<string, string> = { pass: '\u2713', fail: '\u2715', warn: '!', na: '\u2013' };
  const MARK_STYLE: Record<string, string> = {
    pass: 'bg-emerald-100 text-emerald-700',
    fail: 'bg-rose-100 text-rose-700',
    warn: 'bg-amber-100 text-amber-700',
    na: 'bg-stone-100 text-stone-400',
  };

  return (
    <div className="space-y-4">
      {/* The verdict first, good or bad. A student who finds out in November
          that the date never fitted has lost the months in which they could
          have done something about it. */}
      <div
        className={cn(
          'rounded-xl border p-3',
          data.feasibility.fits ? 'border-emerald-200 bg-emerald-50' : 'border-rose-200 bg-rose-50'
        )}
      >
        <p className={cn('text-[13px] font-semibold', data.feasibility.fits ? 'text-emerald-900' : 'text-rose-900')}>
          {data.feasibility.fits ? 'This plan fits' : 'This plan does not fit yet'}
        </p>
        <p className="mt-1 text-[12.5px] leading-snug text-stone-700">{data.verdict}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {[
          { n: data.feasibility.daysToExam, l: 'days to CAT' },
          { n: data.mockCount, l: data.mockCount === 1 ? 'mock' : 'mocks' },
          { n: `${data.feasibility.totalHours}h`, l: 'work left' },
        ].map((x) => (
          <div key={x.l} className="rounded-xl border border-stone-200 bg-white p-3 text-center">
            <p className="text-xl font-bold text-stone-900">{x.n}</p>
            <p className="text-[11px] leading-tight text-stone-500">{x.l}</p>
          </div>
        ))}
      </div>

      {/* The checklist door, shown to the student rather than asserted at
          them. Founder, 8 Aug: "no study topic should be missed at all,
          because a student will check whether the plan covered everything."
          A failed check NAMES what is missing — a count cannot be acted on. */}
      <div className="rounded-xl border border-stone-200 bg-white p-3">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-bold text-stone-900">What this plan covers</p>
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-bold',
            data.integrity.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700')}>
            {data.integrity.passed ? 'All checks pass' : 'Needs your attention'}
          </span>
        </div>
        <ul className="mt-2 space-y-2">
          {data.integrity.checks.map((c) => (
            <li key={c.id} className="flex gap-2.5">
              <span className={cn('mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[11px] font-bold',
                MARK_STYLE[c.status] ?? MARK_STYLE.na)}>
                {MARK[c.status] ?? '-'}
              </span>
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold leading-snug text-stone-800">{c.label}</p>
                <p className="text-[12px] leading-snug text-stone-500">{c.detail}</p>
                {c.items && c.items.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-[11.5px] font-medium text-stone-600 underline underline-offset-2">
                      Show the {c.items.length}
                    </summary>
                    <p className="mt-1 text-[11.5px] leading-snug text-stone-500">{c.items.join(' \u00b7 ')}</p>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-2">
        {shown.map((d) => {
          const newPhase = d.phase !== lastPhase;
          lastPhase = d.phase;
          return (
            <div key={d.date}>
              {newPhase && (
                <p className="mb-1.5 mt-3 text-[11px] font-bold uppercase tracking-widest text-stone-400">
                  {PHASE_LABEL[d.phase] ?? d.phase}
                </p>
              )}
              <div
                className={cn(
                  'rounded-xl border p-2.5',
                  d.isMockDay ? 'border-orange-200 bg-orange-50/40' : 'border-stone-200 bg-white'
                )}
              >
                <div className="flex items-baseline justify-between">
                  <span className="text-[12px] font-semibold text-stone-700">{fmt(d.date)}</span>
                  {d.totalHours > 0 && <span className="text-[11px] text-stone-400">{d.totalHours}h</span>}
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {d.items.length === 0 && <span className="text-[12px] text-stone-400">Rest</span>}
                  {d.items.map((it, i) => (
                    <span
                      key={`${d.date}-${i}`}
                      className={cn('rounded-md px-2 py-1 text-[11.5px] font-medium', KIND_STYLE[it.kind] ?? KIND_STYLE.topic)}
                    >
                      {it.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {limit < data.days.length && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + 30)}
          className="w-full rounded-xl border border-stone-300 py-2.5 text-[13px] font-semibold text-stone-700"
        >
          Show the next 30 days ({data.days.length - limit} left)
        </button>
      )}

      <p className="px-1 text-center text-[11.5px] leading-snug text-stone-500">
        {data.horizonReason === 'coaching_month'
          ? 'Your plan follows your coaching, so it runs to the end of the month you uploaded. Send the next sheet and it continues.'
          : `Planned to CAT day, ${fmt(data.examDate)}. Topics further out will shift as you study — the shape stays.`}
      </p>
    </div>
  );
}
