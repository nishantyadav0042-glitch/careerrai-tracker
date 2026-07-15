'use client';

import { useState } from 'react';
import { Clock, CheckCircle2, CalendarDays, ChevronRight } from 'lucide-react';
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
  const w = 150, h = 46, pad = 4;
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

  const tone = TONE[pace.status];
  const R = 46, C = 2 * Math.PI * R;
  const offset = C * (1 - pace.completedPct / 100);
  const todayIso = new Date().toISOString().split('T')[0];

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

  return (
    <div className="rounded-3xl border border-stone-200/70 bg-white p-5 shadow-sm">
      <div className="flex items-start gap-4">
        {/* Ring — % of syllabus done */}
        <div className="relative shrink-0">
          <svg width="112" height="112" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r={R} fill="none" stroke="#f1f0ef" strokeWidth="9" />
            <circle cx="56" cy="56" r={R} fill="none" stroke={tone.ring} strokeWidth="9" strokeLinecap="round"
              strokeDasharray={C} strokeDashoffset={offset} transform="rotate(-90 56 56)" />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-extrabold leading-none text-stone-900">{pace.completedPct}<span className="text-base font-bold">%</span></span>
            <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Progress</span>
          </div>
        </div>

        {/* Detail */}
        <div className="min-w-0 flex-1">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold ${tone.chipBg} ${tone.chipText}`}>{tone.label}</span>
          <p className="mt-1.5 text-[17px] font-extrabold leading-tight text-stone-900">{headline}</p>
          <div className="mt-2 space-y-1 text-[13px] text-stone-600">
            <div className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-stone-400" /><b className="font-bold text-stone-900">{pace.requiredPerDay}h</b> / day</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-stone-400" /><b className="font-bold text-stone-900">{pace.remainingHours}h</b> left</div>
            <div className="flex items-center gap-1.5"><CalendarDays className="h-3.5 w-3.5 text-stone-400" /><b className="font-bold text-stone-900">{pace.daysLeft}</b> day{pace.daysLeft === 1 ? '' : 's'} to go</div>
          </div>
        </div>

        {/* Weekly sparkline — hidden on the narrowest screens to avoid crowding */}
        <div className="hidden shrink-0 sm:block">
          <Sparkline week={week} labels={weekLabels} color={tone.ring} />
        </div>
      </div>

      {/* Sparkline for narrow screens, full width */}
      <div className="mt-3 sm:hidden">
        <Sparkline week={week} labels={weekLabels} color={tone.ring} />
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-3">
        <span className="text-[12px] text-stone-500">Finish by <span className="font-bold text-stone-800">{fmt(targetIso)}</span></span>
        <button type="button" onClick={() => { setEditing((v) => !v); setErr(null); }}
          className="inline-flex items-center gap-0.5 text-[12px] font-bold text-indigo-600 hover:underline">
          Reschedule <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      {editing && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-3">
          <input type="date" value={date} min={todayIso} onChange={(e) => setDate(e.target.value)}
            className="rounded-lg border border-stone-300 px-2.5 py-1.5 text-sm text-stone-900" />
          <button type="button" disabled={busy || !date} onClick={saveDate}
            className="rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
            {busy ? 'Saving…' : 'Set new date'}
          </button>
          {err && <span className="text-[11px] text-rose-600">{err}</span>}
          <span className="w-full text-[10.5px] text-stone-400">Your daily hours recalculate the moment you move the date.</span>
        </div>
      )}
    </div>
  );
}
