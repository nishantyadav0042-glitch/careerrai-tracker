'use client';

import { useCallback, useEffect, useState } from 'react';
import { Zap, ArrowRight, Check, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/journey';
import type { StudyAction } from '@/lib/next-action';

type Action = StudyAction & { href: string; taskId: string | null };

// The first thing on the home screen, and the reason to open the app at all.
//
// Everything else here looks backwards — what got logged, what got parsed, how
// far along you are. This is the only surface that answers the question a
// student actually has at 9pm: what do I do with the hour I've got?
//
// Deliberately sparse. The first version showed three actions, three long
// justifications and a footer, and a student had to READ it. The whole point
// is that they take it in without reading: one thing to do, one number, one
// reason. The detail is still there for anyone who taps.
const CHOICES = [30, 60, 120];

export function NextActionCard() {
  const router = useRouter();
  const [minutes, setMinutes] = useState(60);
  const [actions, setActions] = useState<Action[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [finishedToday, setFinishedToday] = useState(0);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (mins: number) => {
    setLoading(true);
    // Hard timeout. Without one, a slow query left this card sitting on
    // "Working it out..." forever at the very top of the home screen — the
    // worst possible place for a spinner that never resolves. On any failure
    // we render NOTHING rather than a permanent promise.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const res = await fetch(`/api/next-action?minutes=${mins}`, { signal: ctrl.signal });
      const json = await res.json();
      setActions((json.actions as Action[]) ?? []);
      setFinishedToday(Number(json.finishedToday) || 0);
    } catch {
      setActions([]);
    } finally {
      clearTimeout(timer);
      setLoading(false);
    }
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(60); }, [load]);

  // Start only opens the work. It deliberately does NOT mark the action done —
  // opening a topic is not finishing it, and treating the two as the same thing
  // is what left this card with no way to ever be closed.
  function start(a: Action) {
    track('next_action_started', { kind: a.kind, topic: a.topic, minutes: a.minutes });
    // The server picked the destination, checking which section plans are
    // actually switched on for this account.
    router.push(a.href);
  }

  // Done is the close, and it is the SAME "done" the daily log means.
  //
  // Tapping it completes the real plan task for this topic, which advances
  // coverage, shows the topic already ticked when they open the log, and feeds
  // the streak through the exact path the log itself uses. Previously this only
  // wrote an internal ack, so a student marked the same work done twice — once
  // here, once in the log — and the card's Done counted for nothing.
  async function markDone(a: Action) {
    setBusy(true);
    track('next_action_done', { kind: a.kind, topic: a.topic, hadTask: !!a.taskId });
    try {
      if (a.taskId) {
        await fetch('/api/routine/complete-task', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          // green = finished it. The same signal the log's "Done" sends.
          // close_day: this block counts as studying today. The manual log
          // already treats one marked topic as a valid day; the card should
          // not be held to a stricter bar than the log it writes through.
          body: JSON.stringify({ task_id: a.taskId, confidence: 'green', close_day: true }),
        });
      }
      // Always ack too — this is what the ranking loop learns from, and it's
      // the only record for actions with no matching plan task (a coaching
      // target, say).
      await fetch('/api/next-action/ack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: a.kind }),
      });
      await load(minutes);
      // The streak, ring and plan all read from what we just wrote.
      router.refresh();
    } catch { /* leave the card as it was */ }
    setBusy(false);
  }

  // Everything suggested today is finished. Say so once, briefly — a student
  // who did the work should see it land, not just watch the card vanish.
  if (!loading && actions && actions.length === 0) {
    if (finishedToday > 0) {
      return (
        <div className="flex items-center gap-2.5 rounded-2xl bg-emerald-600 p-4 text-white">
          <CheckCircle2 className="h-5 w-5 shrink-0" />
          <p className="text-[14px] font-bold">
            Done for today — {finishedToday} {finishedToday === 1 ? 'block' : 'blocks'} logged.
          </p>
        </div>
      );
    }
    return null;
  }

  const primary = actions?.[0];
  const rest = actions?.slice(1) ?? [];

  return (
    <div className="w-full rounded-2xl bg-stone-900 p-4 text-left text-white">
      <div
        role="button" tabIndex={0}
        onClick={() => { setExpanded((e) => !e); track('next_action_expanded', { expanded: !expanded }); }}
        onKeyDown={(e) => { if (e.key === 'Enter') setExpanded((x) => !x); }}
        className="flex items-center gap-2"
      >
        <Zap className="h-3.5 w-3.5 text-orange-400" />
        <span className="text-[10px] font-bold uppercase tracking-widest text-white/50">Do this next</span>
      </div>

      {loading || !primary ? (
        <p className="mt-2 text-[15px] text-white/40">Working it out…</p>
      ) : (
        <>
          {/* The one thing. Big enough to read without reading. */}
          <p className="mt-2 text-[19px] font-bold leading-tight">{primary.title}</p>
          <p className="mt-1 text-[13px] text-white/60">
            {primary.minutes} min · {primary.whyShort}
          </p>

          {/* Two separate things: open the work, or close it out. */}
          <div className="mt-3 flex gap-2">
            <button
              type="button" onClick={() => start(primary)} disabled={busy}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-3 text-[14px] font-bold text-white active:scale-[0.99] disabled:opacity-60"
            >
              Start now <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button" onClick={() => void markDone(primary)} disabled={busy}
              aria-label="Mark this done"
              className="flex items-center justify-center gap-1 rounded-xl bg-white/10 px-3.5 py-3 text-[13px] font-bold text-white active:scale-[0.98] disabled:opacity-60"
            >
              <Check className="h-4 w-4" /> Done
            </button>
          </div>

          {expanded && (
            <>
              <p className="mt-3 border-t border-white/10 pt-3 text-[12px] leading-relaxed text-white/70">
                {primary.why}
              </p>
              {rest.length > 0 && (
                <div className="mt-3 space-y-2">
                  {rest.map((a, i) => (
                    <div key={`${a.kind}-${i}`}>
                      <p className="text-[13px] font-semibold text-white/90">{a.title}</p>
                      <p className="text-[11px] text-white/50">{a.minutes} min · {a.whyShort}</p>
                    </div>
                  ))}
                </div>
              )}
              <div className="mt-3 flex gap-1.5">
                {CHOICES.map((m) => (
                  <span
                    key={m}
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setMinutes(m); void load(m); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.stopPropagation(); setMinutes(m); void load(m); } }}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${
                      minutes === m ? 'bg-white text-stone-900' : 'bg-white/10 text-white/60'
                    }`}
                  >
                    {m < 60 ? `${m}m` : `${m / 60}h`}
                  </span>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
