'use client';

import { useCallback, useEffect, useState } from 'react';
import { Zap, ArrowRight, Check } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/journey';
import type { StudyAction } from '@/lib/next-action';

type Action = StudyAction & { id: number | null; resolved?: boolean };

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
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async (mins: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/next-action?minutes=${mins}`);
      const json = await res.json();
      setActions((json.actions as Action[]) ?? []);
    } catch {
      setActions([]);
    }
    setLoading(false);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(60); }, [load]);

  // One destination, chosen for them. Making a student pick where to go is
  // the confusion this card exists to remove.
  function destinationFor(a: Action): string {
    if (a.kind === 'coaching_due') return '/student/profile';
    const sec = (a.section ?? '').toLowerCase();
    if (sec === 'qa' || sec === 'varc' || sec === 'dilr') return `/student/plan/${sec}`;
    return '/student/plan/topics';
  }

  async function start(a: Action) {
    track('next_action_started', { kind: a.kind, topic: a.topic, minutes: a.minutes });
    // Mark it followed on the way out. They asked for the work and we're
    // handing it to them — waiting 36 hours for a cron to infer the same thing
    // throws away the cleanest signal we'll ever get.
    if (a.id) {
      void fetch('/api/next-action/ack', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: a.id }),
      }).catch(() => {});
    }
    setDone(true);
    router.push(destinationFor(a));
  }

  if (!loading && (!actions || actions.length === 0)) return null;

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

          {/* The whole point: one tap from knowing to doing. */}
          <button
            type="button" onClick={() => void start(primary)}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl bg-orange-500 py-3 text-[14px] font-bold text-white active:scale-[0.99]"
          >
            {done ? (<><Check className="h-4 w-4" /> Opening…</>) : (<>Start now <ArrowRight className="h-4 w-4" /></>)}
          </button>

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
