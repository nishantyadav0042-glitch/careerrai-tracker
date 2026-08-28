'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, XCircle } from 'lucide-react';

// ── Can this mentor actually hold a session? ────────────────────────────────
//
// Two things must BOTH be true, and until now nothing said so out loud:
// a Google connection (so a meeting room can exist) and a described week (so
// slots can be computed). Production has eight mentors, zero connections and
// zero availability rows — and every one of them believed they were set up.
//
// Never claims readiness it cannot back. Each row is a fact with the exact
// action beside it, because "not ready" with no next step is just a scolding.

const DAYS = [
  { n: 1, label: 'M' }, { n: 2, label: 'T' }, { n: 3, label: 'W' },
  { n: 4, label: 'T' }, { n: 5, label: 'F' }, { n: 6, label: 'S' }, { n: 7, label: 'S' },
];

function hhmm(mins: number): string {
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
}
function toMins(v: string): number {
  const [h, m] = v.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function Row({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <div className="flex items-start gap-2">
      {ok
        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
        : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-rose-500" />}
      <div className="min-w-0">
        <p className={`text-[13px] font-bold ${ok ? 'text-stone-800' : 'text-rose-800'}`}>{label}</p>
        <p className="text-[11px] leading-snug text-stone-500">{detail}</p>
      </div>
    </div>
  );
}

export function SessionReadiness({ canBook, availability }: {
  /** decideBookability()'s verdict, computed on the server. The one rule. */
  canBook: boolean;
  availability: {
    configured: boolean;
    work_days?: number[]; start_minute?: number; end_minute?: number;
    slot_minutes?: number; buffer_minutes?: number; active?: boolean;
  };
}) {
  const router = useRouter();
  const [open, setOpen] = useState(!availability.configured);
  const [days, setDays] = useState<number[]>(availability.work_days ?? [1, 2, 3, 4, 5]);
  const [start, setStart] = useState(hhmm(availability.start_minute ?? 600));
  const [end, setEnd] = useState(hhmm(availability.end_minute ?? 1140));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // THE CANONICAL VERDICT, passed in — never recomputed here.
  //
  // This line used to read `googleConnected && configured && active !== false`,
  // which required Google (a requirement removed elsewhere as a design
  // mistake) and ignored a pasted meeting room entirely. A mentor with a room
  // and hours was told "Not ready — students cannot book you" while the API
  // happily accepted bookings for her. Seven definitions of bookable, four
  // different answers for one real mentor; this was one of them.
  const ready = canBook;

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/buddy/availability', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          work_days: days,
          start_minute: toMins(start),
          end_minute: toMins(end),
          slot_minutes: availability.slot_minutes ?? 45,
          buffer_minutes: availability.buffer_minutes ?? 15,
          active: true,
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) { setOpen(false); router.refresh(); }
      else setError(json?.error ?? 'Could not save — try again.');
    } catch {
      setError('Connection issue — try again.');
    } finally { setSaving(false); }
  }

  return (
    <div className={`rounded-2xl border p-4 ${ready ? 'border-emerald-200 bg-emerald-50' : 'border-amber-300 bg-amber-50'}`}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-500">Session readiness</p>
      <p className={`mt-0.5 text-[15px] font-extrabold ${ready ? 'text-emerald-800' : 'text-amber-900'}`}>
        {ready ? 'Ready — students can book you' : 'Not ready — students cannot book you yet'}
      </p>

      <div className="mt-3 space-y-2">
        {/* The Google row lived here and pointed at nothing — its detail said
            "Connect it below" while the only connect link sat in a different
            card. Google is now the GoogleConnect card's single job, rendered
            directly above this one, so repeating it here would be the second
            visible setup prompt the 27 Aug simplification removed. This card
            is availability, and only availability. */}
        <Row
          ok={availability.configured && availability.active !== false}
          label={availability.configured
            ? (availability.active === false ? 'Calendar switched off' : 'Working hours set')
            : 'Working hours not set'}
          detail={availability.configured
            ? `${(availability.work_days ?? []).length} days a week, ${hhmm(availability.start_minute ?? 0)}–${hhmm(availability.end_minute ?? 0)}`
            : 'Students can only pick times you have opened.'}
        />
      </div>

      {!open && (
        <button type="button" onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl bg-stone-900 py-2.5 text-[13px] font-bold text-white">
          {availability.configured ? 'Change my hours' : 'Set my hours'}
        </button>
      )}

      {open && (
        <div className="mt-3 space-y-2.5 rounded-xl border border-stone-200 bg-white p-3">
          <div>
            <p className="text-[11px] font-semibold text-stone-500">Days you take sessions</p>
            <div className="mt-1 flex gap-1">
              {DAYS.map((d) => (
                <button
                  key={d.n} type="button" aria-pressed={days.includes(d.n)}
                  onClick={() => setDays((cur) => cur.includes(d.n) ? cur.filter((x) => x !== d.n) : [...cur, d.n].sort())}
                  className={`h-9 w-9 rounded-lg text-[12px] font-bold ${
                    days.includes(d.n) ? 'bg-teal-700 text-white' : 'border border-stone-200 text-stone-500'
                  }`}
                >{d.label}</button>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <label className="flex-1 text-[11px] font-semibold text-stone-500">
              From
              <input type="time" value={start} onChange={(e) => setStart(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm" />
            </label>
            <label className="flex-1 text-[11px] font-semibold text-stone-500">
              Until
              <input type="time" value={end} onChange={(e) => setEnd(e.target.value)}
                className="mt-1 w-full rounded-lg border border-stone-300 px-2 py-2 text-sm" />
            </label>
          </div>
          <p className="text-[10.5px] leading-snug text-stone-400">
            Sessions are {availability.slot_minutes ?? 45} minutes with a{' '}
            {availability.buffer_minutes ?? 15}-minute gap after each one. Nobody can
            book inside that gap.
          </p>
          {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}
          <button type="button" onClick={() => void save()} disabled={saving || days.length === 0}
            className="w-full rounded-xl bg-teal-700 py-2.5 text-[13px] font-bold text-white disabled:opacity-50">
            {saving ? 'Saving…' : 'Save my hours'}
          </button>
        </div>
      )}
    </div>
  );
}
