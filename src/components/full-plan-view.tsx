'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '@/lib/utils';

// The whole plan — and the screen a student should enjoy opening.
//
// Founder, 8 Aug: "the presentation and UI of the plan should be world class,
// study plan dekh ke hi maza aa jana chahiye", with Cal AI named as the bar.
//
// What Cal AI actually does, and what is borrowed here:
//   · ONE hero number, enormous, answering the only question you opened for.
//     There it is calories left; here it is days to CAT.
//   · A ring for progress, not a bar. A ring reads as "how much of the whole",
//     which is exactly the syllabus question.
//   · A horizontal date strip you can thumb through, with today anchored.
//   · Large-radius cards, generous white, hairline borders, almost no shadow.
//   · Colour used ONLY semantically — mock, revision, analysis each own a hue,
//     and nothing else is coloured, so the colours still mean something.
//
// What is deliberately NOT borrowed: gamified badges. Cal AI is a habit app
// where any logging is a win. A CAT plan that celebrates itself while a student
// is fifteen topics short would be the same dishonesty this file's data layer
// spent all day removing.

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
  feasibility: {
    fits: boolean; totalHours: number; mockHours: number; syllabusHours: number;
    syllabusTotalHours: number; syllabusDonePct: number;
    daysToExam: number; topicDaysAvailable: number; topicCapacityHours: number | null;
    committedPerDay: number | null; requiredPerDay: number;
  };
}

const PHASE = {
  build: { label: 'Build', note: 'New topics, one mock a week' },
  intensive: { label: 'Intensive', note: 'Two mocks a week' },
  revision: { label: 'Revision', note: 'No new topics from here' },
} as const;

// Semantic only. A topic is the default and stays neutral, so the coloured
// items genuinely stand out on a scan.
const KIND = {
  mock: { dot: 'bg-orange-500', chip: 'bg-orange-50 text-orange-900 ring-orange-200' },
  mock_analysis: { dot: 'bg-amber-400', chip: 'bg-amber-50 text-amber-900 ring-amber-200' },
  revision: { dot: 'bg-violet-500', chip: 'bg-violet-50 text-violet-900 ring-violet-200' },
  topic: { dot: 'bg-stone-300', chip: 'bg-stone-50 text-stone-700 ring-stone-200' },
} as const;

function kindOf(k: string) { return KIND[k as keyof typeof KIND] ?? KIND.topic; }

const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

function d(iso: string) { return new Date(iso + 'T00:00:00'); }
function dayNum(iso: string) { return d(iso).getDate(); }
function dowIdx(iso: string) { return d(iso).getDay(); }
function longDay(iso: string) {
  return d(iso).toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
function monthOf(iso: string) {
  return d(iso).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
}

/** The hero ring: how much of the syllabus is already behind them. */
function Ring({ pct, big, small }: { pct: number; big: string; small: string }) {
  const R = 54;
  const C = 2 * Math.PI * R;
  const shown = Math.max(0, Math.min(100, pct));
  return (
    <div className="relative grid h-[136px] w-[136px] place-items-center">
      <svg viewBox="0 0 128 128" className="absolute h-full w-full -rotate-90">
        <circle cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeWidth="10" className="text-stone-100" />
        <circle
          cx="64" cy="64" r={R} fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round"
          className="text-stone-900"
          strokeDasharray={C}
          strokeDashoffset={C - (C * shown) / 100}
        />
      </svg>
      <div className="relative text-center">
        <p className="text-[34px] font-bold leading-none tracking-tight text-stone-900">{big}</p>
        <p className="mt-1 text-[11px] font-medium uppercase tracking-wider text-stone-400">{small}</p>
      </div>
    </div>
  );
}

export function FullPlanView() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [showChecks, setShowChecks] = useState(false);
  const stripRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/plan/full')
      .then((r) => r.json())
      .then((j) => (j.error ? setError(j.error) : (setData(j), setSelected(j.days?.[0]?.date ?? null))))
      .catch(() => setError('Could not load your plan.'));
  }, []);

  const byDate = useMemo(
    () => new Map((data?.days ?? []).map((x) => [x.date, x])),
    [data],
  );

  if (error) return <p className="px-4 py-10 text-center text-sm text-stone-500">{error}</p>;
  if (!data) {
    return (
      <div className="space-y-3 px-1 py-6">
        <div className="mx-auto h-[136px] w-[136px] animate-pulse rounded-full bg-stone-100" />
        <div className="h-16 animate-pulse rounded-2xl bg-stone-100" />
        <div className="h-32 animate-pulse rounded-2xl bg-stone-100" />
      </div>
    );
  }

  const f = data.feasibility;
  // The ring shows SYLLABUS DONE, which is the only progress a student cares
  // about. The first version filled it with elapsed time, which on day one is
  // 1% and says nothing — a ring that moves for reasons the student did not
  // cause is decoration pretending to be data.
  const sel = selected ? byDate.get(selected) : null;
  const failed = data.integrity.checks.filter((c) => c.status === 'fail');

  return (
    <div className="space-y-5">
      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center pt-1">
        <Ring pct={f.syllabusDonePct} big={String(f.daysToExam)} small="days to CAT" />
        <p className="mt-3 text-[13px] font-semibold text-stone-800">
          {f.syllabusDonePct}% of your syllabus is done
        </p>
        <p className="mt-0.5 text-[12.5px] text-stone-500">
          {f.syllabusHours}h left · {data.mockCount} mocks · {f.mockHours}h
        </p>
      </div>

      {/* ── The verdict. Never hidden, never dressed up. ──────────────────── */}
      <div
        className={cn(
          'rounded-2xl p-4',
          f.fits ? 'bg-emerald-50' : 'bg-rose-50',
        )}
      >
        <div className="flex items-center gap-2">
          <span className={cn('h-2 w-2 rounded-full', f.fits ? 'bg-emerald-500' : 'bg-rose-500')} />
          <p className={cn('text-[13px] font-bold', f.fits ? 'text-emerald-900' : 'text-rose-900')}>
            {f.fits ? 'Everything fits before CAT' : 'This does not fit yet'}
          </p>
        </div>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-stone-700">{data.verdict}</p>
      </div>

      {/* ── Coverage checklist, collapsed unless something failed ─────────── */}
      <button
        type="button"
        onClick={() => setShowChecks((v) => !v)}
        className="flex w-full items-center justify-between rounded-2xl border border-stone-200 bg-white px-4 py-3 text-left"
      >
        <div>
          <p className="text-[13px] font-bold text-stone-900">What this plan covers</p>
          <p className="mt-0.5 text-[11.5px] text-stone-500">
            {failed.length === 0
              ? `${data.integrity.checks.length} checks, all clear`
              : `${failed.length} need${failed.length === 1 ? 's' : ''} your attention`}
          </p>
        </div>
        <span
          className={cn(
            'grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold',
            failed.length === 0 ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700',
          )}
        >
          {failed.length === 0 ? '✓' : failed.length}
        </span>
      </button>

      {showChecks && (
        <ul className="space-y-2.5 rounded-2xl border border-stone-200 bg-white p-4">
          {data.integrity.checks.map((c) => (
            <li key={c.id} className="flex gap-3">
              <span
                className={cn(
                  'mt-1 h-2 w-2 shrink-0 rounded-full',
                  c.status === 'pass' ? 'bg-emerald-500'
                    : c.status === 'fail' ? 'bg-rose-500'
                      : c.status === 'warn' ? 'bg-amber-400' : 'bg-stone-300',
                )}
              />
              <div className="min-w-0">
                <p className="text-[12.5px] font-semibold leading-snug text-stone-900">{c.label}</p>
                <p className="mt-0.5 text-[12px] leading-relaxed text-stone-500">{c.detail}</p>
                {c.items && c.items.length > 0 && (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer list-none text-[11.5px] font-semibold text-stone-700 underline underline-offset-2">
                      Show all {c.items.length}
                    </summary>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {c.items.map((t) => (
                        <span key={t} className="rounded-md bg-rose-50 px-1.5 py-0.5 text-[11px] text-rose-800 ring-1 ring-rose-100">
                          {t}
                        </span>
                      ))}
                    </div>
                  </details>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* ── Date strip. Thumb through the plan the way you thumb a calendar. */}
      <div>
        <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-stone-400">
          {selected ? monthOf(selected) : ''}
        </p>
        <div ref={stripRef} className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {data.days.map((day) => {
            const on = day.date === selected;
            return (
              <button
                key={day.date}
                type="button"
                onClick={() => setSelected(day.date)}
                className={cn(
                  'flex w-11 shrink-0 flex-col items-center gap-1 rounded-2xl py-2 transition-colors',
                  on ? 'bg-stone-900' : 'bg-stone-50',
                )}
              >
                <span className={cn('text-[10px] font-semibold', on ? 'text-white/60' : 'text-stone-400')}>
                  {DOW[dowIdx(day.date)]}
                </span>
                <span className={cn('text-[15px] font-bold leading-none', on ? 'text-white' : 'text-stone-800')}>
                  {dayNum(day.date)}
                </span>
                <span className="flex h-1.5 items-center gap-0.5">
                  {day.items.slice(0, 3).map((it, i) => (
                    <span key={i} className={cn('h-1 w-1 rounded-full', on ? 'bg-white/70' : kindOf(it.kind).dot)} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── The selected day, in full ─────────────────────────────────────── */}
      {sel && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4">
          <div className="flex items-baseline justify-between">
            <p className="text-[15px] font-bold text-stone-900">{longDay(sel.date)}</p>
            {sel.totalHours > 0 && (
              <span className="text-[12px] font-semibold text-stone-400">{sel.totalHours}h</span>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] font-medium text-stone-500">
            {PHASE[sel.phase as keyof typeof PHASE]?.label} — {PHASE[sel.phase as keyof typeof PHASE]?.note}
          </p>

          <div className="mt-3 space-y-2">
            {sel.items.length === 0 && (
              <p className="rounded-xl bg-stone-50 px-3 py-4 text-center text-[12.5px] text-stone-400">
                Nothing scheduled — rest is part of the plan too.
              </p>
            )}
            {sel.items.map((it, i) => (
              <div
                key={`${sel.date}-${i}`}
                className={cn('flex items-center gap-3 rounded-xl px-3 py-2.5 ring-1', kindOf(it.kind).chip)}
              >
                <span className={cn('h-2 w-2 shrink-0 rounded-full', kindOf(it.kind).dot)} />
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{it.label}</span>
                <span className="shrink-0 text-[11.5px] font-medium opacity-70">{it.hours}h</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="px-2 pb-2 text-center text-[11.5px] leading-relaxed text-stone-400">
        {data.horizonReason === 'coaching_month'
          ? 'Your plan follows your coaching, so it runs to the end of the month you uploaded. Send the next sheet and it continues.'
          : `Planned to CAT day, ${longDay(data.examDate)}. Topics further out shift as you study — the shape holds.`}
      </p>
    </div>
  );
}
