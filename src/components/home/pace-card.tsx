'use client';

import { useState } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { isTargetExpired, selectableCatCycles } from '@/lib/cat-cycle';
import { HOURS_ARE_ESTIMATES } from '@/lib/prep-model';
import { remainingMockHours } from '@/lib/study-pace';
import type { PaceResult } from '@/lib/study-pace';
import { MIN_DAILY_HOURS, MAX_DAILY_HOURS } from '@/lib/daily-hours';

// The redesigned Home progress card (15 Jul mockup): a %-of-syllabus ring, the
// steady-pace headline, three at-a-glance pace facts, a weekly study sparkline,
// and inline reschedule. Ring % and the daily-hours number come from the same
// pace engine as before — only the presentation changed.

const TONE: Record<PaceResult['status'], { ring: string; chipBg: string; chipText: string; label: string }> = {
  // The chip describes the DATE, not the day's workload — the date is the thing
  // that moves when a student falls behind. "Catching up" used to sit above a
  // headline that had silently added catch-up hours to their commitment.
  ahead:       { ring: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', label: 'Date is safe' },
  on_pace:     { ring: '#6366f1', chipBg: 'bg-indigo-50',  chipText: 'text-indigo-700',  label: 'Date is on track' },
  behind:      { ring: '#f59e0b', chipBg: 'bg-amber-50',   chipText: 'text-amber-700',   label: 'Date is slipping' },
  unrealistic: { ring: '#f43f5e', chipBg: 'bg-rose-50',    chipText: 'text-rose-700',    label: 'Date won\u2019t hold' },
  done:        { ring: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', label: 'Syllabus done' },
};

function fmt(iso: string): string {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'long' });
}

// Compact 7-day sparkline. `week` is 7 daily study-hours ending today; the last
// point (today) is emphasised. Labels are single-letter weekdays under it.
function Sparkline({ week, labels, color }: { week: number[]; labels: string[]; color: string }) {
  const w = 104, h = 34, pad = 4;
  const max = Math.max(1, ...week);
  const step = week.length > 1 ? (w - pad * 2) / (week.length - 1) : 0;
  const pts = week.map((v, i) => {
    const x = pad + i * step;
    const y = h - pad - (v / max) * (h - pad * 2);
    return [x, y] as const;
  });
  const line = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ');
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h - pad} L${pts[0][0].toFixed(1)},${h - pad} Z`;
  const last = pts[pts.length - 1];
  return (
    <div className="flex flex-col items-stretch">
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible">
        <path d={area} fill={color} fillOpacity="0.08" />
        <path d={line} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        {pts.map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i === pts.length - 1 ? 3.5 : 2} fill={i === pts.length - 1 ? color : '#fff'} stroke={color} strokeWidth="1.5" />
        ))}
        <circle cx={last[0]} cy={last[1]} r="6" fill="none" stroke={color} strokeWidth="1.5" opacity="0.35" />
      </svg>
      <div className="mt-1 flex justify-between px-0.5 text-[9px] font-semibold text-stone-400">
        {labels.map((l, i) => (
          <span key={i} className={i === labels.length - 1 ? 'text-indigo-600' : ''}>{l}</span>
        ))}
      </div>
    </div>
  );
}

interface PaceCardProps {
  pace: PaceResult;
  targetIso: string;
  week: number[];
  weekLabels: string[];
}

export function PaceCard({ pace, targetIso, week, weekLabels }: PaceCardProps) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [date, setDate] = useState('');
  // The golden rule: the plan is built around the student's OWN daily hours, and
  // the date is theirs. So the reschedule sheet lets them change BOTH here — set
  // a date, and if it needs more, set the hours it needs, in one place. null =
  // "unchanged from what they committed".
  const [hoursOverride, setHoursOverride] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Their own finish date has already gone. Three students were sitting in this
  // state with daysLeft floored at 1, so the ring demanded an impossible number
  // of hours a day. We do NOT quietly move their date — that's their
  // commitment. We tell them it's passed and hand them the control.
  const expired = isTargetExpired(targetIso);
  const cycles = selectableCatCycles(new Date(), 2);

  const tone = TONE[pace.status];
  const R = 30, C = 2 * Math.PI * R;
  const offset = C * (1 - pace.completedPct / 100);
  const todayIso = new Date().toISOString().split('T')[0];

  // Reschedule negotiation (founder, 23 July): moving the date must TELL the
  // student what it costs before they commit — "this date needs Xh/day, OK?"
  //
  // Priced through the SAME engine as the ring: pace.remainingHours is the
  // engine's own syllabus figure, and the mock budget is added by the same
  // shared function every other surface uses. The old line here reconstructed
  // remaining work as requiredPerDay × daysLeft — re-deriving from a
  // half-hour-rounded number (compounding its rounding error by up to
  // daysLeft/4 hours) and silently folding mock hours into "syllabus", so
  // this warning could contradict the ring two centimetres above it.
  // Their own number, never the date's demand. Falling back to requiredPerDay
  // here would have this warning compare a new date against a number the
  // student never chose.
  const committedPerDay = pace.committedPerDay;
  // The hours in play right now — their override if they've bumped it, else what
  // they committed. The date warning is measured against THIS, so raising the
  // hours in place turns the warning green without leaving the sheet.
  const effectiveHours = hoursOverride ?? committedPerDay ?? null;
  const daysToNew = date ? Math.max(1, Math.ceil((new Date(date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / 86_400_000)) : null;
  const remainingWithMocks = pace.remainingHours + remainingMockHours(pace.remainingHours);
  const requiredForNew = daysToNew ? Math.round((remainingWithMocks / daysToNew) * 2) / 2 : null;
  const tooDemanding = requiredForNew != null && effectiveHours != null && requiredForNew > effectiveHours + 0.5;
  // The hours this date actually needs — the number to raise to, bounded.
  const hoursForDate = requiredForNew != null ? Math.min(MAX_DAILY_HOURS, Math.max(MIN_DAILY_HOURS, Math.ceil(requiredForNew))) : null;
  const hoursChanged = hoursOverride != null && hoursOverride !== committedPerDay;

  function stepHours(delta: number) {
    const cur = effectiveHours ?? MIN_DAILY_HOURS;
    setHoursOverride(Math.min(MAX_DAILY_HOURS, Math.max(MIN_DAILY_HOURS, cur + delta)));
  }

  async function save() {
    if (!date && !hoursChanged) return;
    setBusy(true); setErr(null);
    try {
      const payload: Record<string, unknown> = {};
      if (date) payload.syllabus_target_date = date;
      if (hoursChanged) payload.daily_hours = hoursOverride;
      const res = await fetch('/api/student/post-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      setEditing(false);
      window.location.reload();
    } catch {
      setErr('Could not update — try again.');
    } finally {
      setBusy(false);
    }
  }

  // THE HEADLINE IS THE STUDENT'S OWN NUMBER. Always.
  //
  // It used to be `pace.requiredPerDay` — remaining syllabus ÷ days to their
  // date. That number moves on its own every morning, so this card showed one
  // figure while the plan two cards below was built from another, and neither
  // was the one the student had typed. It is the most visible half of "sometimes
  // I see 4 hours, sometimes 6".
  //
  // The date is what gives now, so behind/ahead is said as a DATE fact, not by
  // quietly adding hours to their day. A student who is behind sees their own
  // hours and a warning about the date — never "5h + 2h catch-up", which is the
  // app inventing a commitment on their behalf.
  const mine = pace.committedPerDay;
  const headline = pace.status === 'done'
    ? 'Syllabus complete 🎉'
    : mine == null
      // No hours set yet (a day-one account). Say nothing about a number we
      // do not have rather than substituting the date's demand for it.
      ? 'Set your daily hours to size your plan'
      : pace.catchUpPerDay > 0
        ? `${mine}h a day — your date is slipping`
        : pace.aheadPerDay > 0
          ? `${mine}h a day — you're ahead`
          : `${mine}h a day, steady`;

  if (expired && !editing) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-[15px] font-bold text-stone-900">Your finish date has passed</p>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
          You set <span className="font-semibold">{fmt(targetIso)}</span>. Pick a new one — your daily hours stay
          exactly as you set them, and nothing you&apos;ve logged is lost.
        </p>
        <button
          type="button" onClick={() => { setEditing(true); setErr(null); }}
          className="mt-3 w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white active:scale-[0.99]"
        >
          Pick a new date
        </button>
        {cycles.length > 1 && (
          <p className="mt-2 text-center text-[11px] text-stone-500">
            Writing {cycles[1].label} instead? Choose a date up to{' '}
            {cycles[1].syllabusCutoff.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-stone-200/70 bg-white p-3 shadow-sm">
      <div className="flex items-center gap-2.5">
        {/* Ring — % of syllabus done */}
        <div className="relative shrink-0">
          <svg width="72" height="72" viewBox="0 0 72 72">
            <circle cx="36" cy="36" r={R} fill="none" stroke="#f1f0ef" strokeWidth="7" />
            <circle cx="36" cy="36" r={R} fill="none" stroke={tone.ring} strokeWidth="7" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 36 36)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-lg font-extrabold leading-none text-stone-900">{pace.completedPct}<span className="text-[11px] font-bold">%</span></span>
            {/* "Covered", not "Progress". This ring is built from statuses the
                student declared — it measures what they say they have been
                through, which is not the same claim as knowing it. The
                Preparation Index is where earned evidence is shown. */}
            <span className="text-[8px] font-semibold uppercase tracking-wide text-stone-400">Covered</span>
          </div>
        </div>

        {/* Detail — one clean line, no repeated pace stats */}
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-bold ${tone.chipBg} ${tone.chipText}`}>{tone.label}</span>
          <p className="mt-0.5 text-[14px] font-extrabold leading-tight text-stone-900">{headline}</p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-stone-500"><CalendarDays className="h-3 w-3" />{pace.daysLeft} days to CAT syllabus</p>
        </div>

        {/* Weekly sparkline — always inline */}
        <div className="hidden shrink-0 min-[380px]:block">
          <Sparkline week={week} labels={weekLabels} color={tone.ring} />
        </div>
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
        <span className="text-[12px] text-stone-500">Finish by <span className="font-bold text-stone-800">{fmt(targetIso)}</span></span>
        <button type="button" onClick={() => { setEditing((v) => !v); setErr(null); }}
          className="inline-flex items-center gap-0.5 text-[12px] font-bold text-indigo-600 hover:underline">
          Reschedule <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <div className="mt-3 space-y-2.5 border-t border-stone-100 pt-3">
          {/* Founder principle: never fake precision. Students forgive an
              estimate that says it is one. */}
          <p className="text-[11px] leading-relaxed text-stone-400">{HOURS_ARE_ESTIMATES}</p>

          {/* Golden rule, made visible: the plan is built around YOUR hours. The
              date is yours; if it needs more, set the hours it needs — here. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Finish by</span>
            <input type="date" value={date} min={todayIso} onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-900" />
          </div>

          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">Daily hours</span>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => stepHours(-1)} disabled={effectiveHours != null && effectiveHours <= MIN_DAILY_HOURS}
                className="grid h-8 w-8 place-items-center rounded-lg border border-stone-300 text-lg font-bold text-stone-700 disabled:opacity-40">−</button>
              <span className="w-14 text-center text-sm font-bold text-stone-900">{effectiveHours != null ? `${effectiveHours}h` : '—'}</span>
              <button type="button" onClick={() => stepHours(1)} disabled={effectiveHours != null && effectiveHours >= MAX_DAILY_HOURS}
                className="grid h-8 w-8 place-items-center rounded-lg border border-stone-300 text-lg font-bold text-stone-700 disabled:opacity-40">+</button>
            </div>
          </div>

          {/* The truth about the date they just picked — before they commit. Now
              with the fix in-place: raise the hours to what the date needs. */}
          {requiredForNew != null && effectiveHours != null && (
            tooDemanding ? (
              <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-3">
                <p className="text-[12px] font-bold text-rose-700">⚠ That date needs more than you study.</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-stone-700">
                  Finishing by <b>{fmt(date)}</b> takes <b className="text-rose-700">{requiredForNew}h a day</b>, and you&apos;re set to <b>{effectiveHours}h</b>.
                  {' '}Your plan is built around your hours — so to hit this date, raise them.
                </p>
                {hoursForDate != null && (
                  <button type="button" onClick={() => setHoursOverride(hoursForDate)}
                    className="mt-2 w-full rounded-lg bg-rose-600 py-2 text-[12.5px] font-bold text-white active:scale-[0.99]">
                    Set my hours to {hoursForDate}h/day — hit this date
                  </button>
                )}
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[12.5px] leading-relaxed text-stone-700">
                  Finishing by <b>{fmt(date)}</b> takes about <b className="text-emerald-700">{requiredForNew}h a day</b> — your <b>{effectiveHours}h</b> covers it.
                </p>
              </div>
            )
          )}

          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || (!date && !hoursChanged)} onClick={save}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${tooDemanding ? 'bg-rose-600' : 'bg-stone-900'}`}>
              {busy ? 'Saving…' : tooDemanding ? 'Set it anyway' : 'Save'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setDate(''); setHoursOverride(null); setErr(null); }}
              className="text-xs font-medium text-stone-500 hover:text-stone-700">Cancel</button>
            {err && <span className="text-[11px] text-rose-600">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
