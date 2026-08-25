'use client';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { CalendarDays, Video, LifeBuoy, Check } from 'lucide-react';
import { INTENT_LABEL, type IntentKind } from '@/lib/session-intent';

// ── Choosing when the session happens ───────────────────────────────────────
//
// The product must never show a step it cannot fulfil. This surface is a
// state machine, not a calendar: most of its states are honest answers about
// why a picker is NOT being shown.
//
//   no_credit           — nothing bought
//   awaiting_assignment — paid, no mentor matched yet (credit intact)
//   needs_team          — mentor cannot actually hold a session
//   no_slots            — bookable mentor, nothing free in the window
//   choose_slot         — the only state with a picker
//   already_scheduled   — booked; show the session, never a second picker
//
// Production today has zero Google connections and zero availability rows, so
// every student lands on `needs_team`. That is correct: offering a slot for a
// mentor with no meeting room is exactly how sixteen sessions were sold and
// none delivered.

type Slot = { startIso: string; label: string };
type Day = { day: string; slots: Slot[] };

interface State {
  state: 'no_credit' | 'awaiting_assignment' | 'needs_team' | 'no_slots'
       | 'choose_slot' | 'already_scheduled';
  message?: string | null;
  buddyName?: string | null;
  intent?: string | null;
  intentNote?: string | null;
  timezone?: string;
  days?: Day[];
  sessionId?: string;
}

function dayLabel(day: string, tz: string): string {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: tz });
  const d = new Date(`${day}T12:00:00Z`);
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000)
    .toLocaleDateString('en-CA', { timeZone: 'UTC' });
  if (day === today) return 'Today';
  if (day === tomorrow) return 'Tomorrow';
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
}

/** The team escalation. wa.me deep link only — no Business API exists. */
function TeamCta({ label = 'Contact CareerRai team' }: { label?: string }) {
  return (
    <a
      href="/support"
      className="mt-3 flex items-center justify-center gap-2 rounded-xl bg-stone-900 py-2.5 text-[13px] font-bold text-white"
    >
      <LifeBuoy className="h-4 w-4" /> {label}
    </a>
  );
}

export function SchedulePicker() {
  const router = useRouter();
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  /** Reads only. Returns null on any failure — the callers decide what to say. */
  const fetchState = useCallback(async (): Promise<State | null> => {
    try {
      const res = await fetch('/api/sessions/schedule');
      const json = await res.json().catch(() => null);
      return res.ok && json ? (json as State) : null;
    } catch {
      return null;
    }
  }, []);

  const load = useCallback(async () => {
    const next = await fetchState();
    if (next) {
      setState(next);
      setOpenDay((next.days?.[0]?.day as string | undefined) ?? null);
    } else {
      setError('Could not load your session — pull to refresh.');
    }
  }, [fetchState]);

  // Re-read on mount, so a refresh at ANY stage shows the true state rather
  // than something the previous render remembered.
  //
  // The `alive` flag is not ceremony: a student who taps away mid-fetch would
  // otherwise have state set on an unmounted component, and the load is slow
  // enough (a roster read plus slot generation) for that to be reachable.
  useEffect(() => {
    let alive = true;
    void (async () => {
      const next = await fetchState();
      if (!alive) return;
      if (next) {
        setState(next);
        setOpenDay((next.days?.[0]?.day as string | undefined) ?? null);
      } else {
        setError('Could not load your session — pull to refresh.');
      }
    })();
    return () => { alive = false; };
  }, []);

  async function book(startIso: string) {
    if (busy) return;
    setBusy(true); setError(null); setPicked(startIso);
    try {
      const res = await fetch('/api/sessions/schedule', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startIso }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok && json?.ok) {
        // Confirmed by the SERVER, never optimistically.
        await load();
        router.refresh();
      } else {
        setError(json?.error ?? 'Could not book that time — try again.');
        // A slot taken between listing and tapping: reload so the student is
        // never staring at a time that no longer exists.
        await load();
      }
    } catch {
      setError('Connection issue — try again.');
    } finally { setBusy(false); setPicked(null); }
  }

  if (!state) {
    return <div className="rounded-2xl border border-stone-200 bg-white p-4 text-[13px] text-stone-500">Loading your session…</div>;
  }

  if (state.state === 'no_credit') return null;

  const why = state.intent
    ? INTENT_LABEL[state.intent as IntentKind] ?? state.intent
    : null;

  const Header = (
    <div className="mb-3">
      <p className="text-[11px] font-bold uppercase tracking-widest text-stone-400">Your 1:1 session</p>
      {state.buddyName && <p className="text-[15px] font-extrabold text-stone-900">with {state.buddyName}</p>}
      {why && (
        <p className="mt-1 rounded-lg bg-teal-50 px-2.5 py-1.5 text-[12px] text-teal-900">
          <b>You booked this for:</b> {why}
          {state.intentNote ? ` — “${state.intentNote}”` : ''}
        </p>
      )}
    </div>
  );

  if (state.state === 'already_scheduled') {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
        {Header}
        <p className="flex items-center gap-1.5 text-[13px] font-bold text-emerald-800">
          <Check className="h-4 w-4" /> Your session is booked.
        </p>
        <p className="mt-0.5 text-[11px] text-emerald-700">
          You will find the join link on this page when it is time.
        </p>
      </div>
    );
  }

  if (state.state === 'awaiting_assignment') {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        {Header}
        <p className="text-[13px] font-semibold text-stone-800">We have your payment.</p>
        <p className="mt-0.5 text-[12px] leading-snug text-stone-600">
          We are matching you with the right buddy for what you asked about. Your
          session is safe — nothing expires.
        </p>
        <TeamCta label="Ask the team" />
      </div>
    );
  }

  if (state.state === 'needs_team' || state.state === 'no_slots') {
    return (
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        {Header}
        <p className="text-[13px] font-semibold text-amber-900">
          Our team will confirm your session time.
        </p>
        <p className="mt-0.5 text-[12px] leading-snug text-amber-800">
          {state.message ?? 'We will be in touch shortly.'} Your session is paid
          for and safe.
        </p>
        <TeamCta />
      </div>
    );
  }

  const days = state.days ?? [];
  const tz = state.timezone ?? 'Asia/Kolkata';

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      {Header}
      <p className="flex items-center gap-1.5 text-[13px] font-bold text-stone-900">
        <CalendarDays className="h-4 w-4" /> Choose your time
      </p>

      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
        {days.map((d) => (
          <button
            key={d.day} type="button" aria-pressed={openDay === d.day}
            onClick={() => setOpenDay(d.day)}
            className={`shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold ${
              openDay === d.day ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600'
            }`}
          >
            {dayLabel(d.day, tz)}
          </button>
        ))}
      </div>

      <div className="mt-2 grid grid-cols-3 gap-1.5">
        {(days.find((d) => d.day === openDay)?.slots ?? []).map((s) => (
          <button
            key={s.startIso} type="button" disabled={busy}
            onClick={() => void book(s.startIso)}
            className={`rounded-lg border py-2 text-[13px] font-bold disabled:opacity-50 ${
              picked === s.startIso ? 'border-teal-700 bg-teal-700 text-white' : 'border-stone-200 bg-white text-stone-800'
            }`}
          >
            {picked === s.startIso && busy ? '…' : s.label}
          </button>
        ))}
      </div>

      {error && <p className="mt-2 text-[12px] font-semibold text-rose-600">{error}</p>}
      <p className="mt-2 flex items-center gap-1 text-[10.5px] text-stone-400">
        <Video className="h-3 w-3" /> Times shown in your buddy’s timezone ({tz.split('/')[1]?.replace('_', ' ')}).
      </p>
    </div>
  );
}
