'use client';

import { useState } from 'react';
import { CalendarDays, ChevronRight } from 'lucide-react';
import { isTargetExpired, selectableCatCycles } from '@/lib/cat-cycle';
import type { PaceResult } from '@/lib/study-pace';

// The redesigned Home progress card (15 Jul mockup): a %-of-syllabus ring, the
// steady-pace headline, three at-a-glance pace facts, a weekly study sparkline,
// and inline reschedule. Ring % and the daily-hours number come from the same
// pace engine as before — only the presentation changed.

const TONE: Record<PaceResult['status'], { ring: string; chipBg: string; chipText: string; label: string }> = {
  ahead:       { ring: '#10b981', chipBg: 'bg-emerald-50', chipText: 'text-emerald-700', label: 'Ahead of pace' },
  on_pace:     { ring: '#6366f1', chipBg: 'bg-indigo-50',  chipText: 'text-indigo-700',  label: 'Right on pace' },
  behind:      { ring: '#f59e0b', chipBg: 'bg-amber-50',   chipText: 'text-amber-700',   label: 'Catching up' },
  unrealistic: { ring: '#f43f5e', chipBg: 'bg-rose-50',    chipText: 'text-rose-700',    label: 'Very tight' },
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
  // Remaining work = the steady per-day requirement × days left (self-consistent
  // with the pace engine, no extra fetch). We never silently invent hours.
  const committedPerDay = pace.committedPerDay ?? pace.requiredPerDay;
  const daysToNew = date ? Math.max(1, Math.ceil((new Date(date + 'T00:00:00').getTime() - new Date(todayIso + 'T00:00:00').getTime()) / 86_400_000)) : null;
  const remainingHours = pace.requiredPerDay * pace.daysLeft;
  const requiredForNew = daysToNew ? Math.round((remainingHours / daysToNew) * 2) / 2 : null;
  const tooDemanding = requiredForNew != null && requiredForNew > committedPerDay + 0.5;

  async function saveDate() {
    if (!date) return;
    setBusy(true); setErr(null);
    try {
      const res = await fetch('/api/student/post-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syllabus_target_date: date }),
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

  const headline = pace.status === 'done'
    ? 'Syllabus complete 🎉'
    : pace.catchUpPerDay > 0
      ? `${pace.committedPerDay ?? pace.requiredPerDay}h + ${pace.catchUpPerDay}h catch-up`
      : pace.aheadPerDay > 0
        ? `${pace.requiredPerDay}h needed · ${pace.aheadPerDay}h ahead`
        : `${pace.requiredPerDay}h a day, steady`;

  if (expired && !editing) {
    return (
      <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
        <p className="text-[15px] font-bold text-stone-900">Your finish date has passed</p>
        <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
          You set <span className="font-semibold">{fmt(targetIso)}</span>. Pick a new one and your plan and daily
          hours recalculate from today — nothing you&apos;ve logged is lost.
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
            <span className="text-[8px] font-semibold uppercase tracking-wide text-stone-400">Progress</span>
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
          <div className="flex flex-wrap items-center gap-2">
            <input type="date" value={date} min={todayIso} onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-900" />
          </div>

          {/* The truth about the date they just picked — before they commit. */}
          {requiredForNew != null && (
            tooDemanding ? (
              <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-3">
                <p className="text-[12px] font-bold text-rose-700">⚠ That date is demanding.</p>
                <p className="mt-0.5 text-[12.5px] leading-relaxed text-stone-700">
                  Finishing by <b>{fmt(date)}</b> means <b className="text-rose-700">{requiredForNew}h every single day</b> — more than your usual <b>{committedPerDay}h</b>. Are you sure you can sustain this? A date you actually hit beats one that looks good and breaks you.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-[12.5px] leading-relaxed text-stone-700">
                  Finishing by <b>{fmt(date)}</b> means about <b className="text-emerald-700">{requiredForNew}h a day</b> — that fits your routine.
                </p>
              </div>
            )
          )}

          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || !date} onClick={saveDate}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 ${tooDemanding ? 'bg-rose-600' : 'bg-stone-900'}`}>
              {busy ? 'Saving…' : tooDemanding ? `Yes, I'll do ${requiredForNew}h/day` : 'Set this date'}
            </button>
            <button type="button" onClick={() => { setEditing(false); setDate(''); setErr(null); }}
              className="text-xs font-medium text-stone-500 hover:text-stone-700">Cancel</button>
            {err && <span className="text-[11px] text-rose-600">{err}</span>}
          </div>
        </div>
      )}
    </div>
  );
}
