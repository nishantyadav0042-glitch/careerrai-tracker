'use client';

import { useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';

// ── "You are not alone" ─────────────────────────────────────────────────────
//
// Founder, 12 Aug 2026 — the two engagement ideas to build first were students
// like me and you are not alone.
//
// The design rule that matters more than the layout: this card is allowed to
// say nothing. Preparation is isolating and a card that says "0 students
// studied today" or "1,482 students are preparing!" both make it worse — one is
// bleak, the other is a billboard nobody believes. So the card renders only the
// lines that are TRUE and SPECIFIC today, and disappears entirely when there
// are none. A student should never learn that the room is empty.
//
// Every number here is a direct count of real students (lib/os/peer-cohort.ts,
// which refuses to speak below MIN_COHORT). Nothing is projected or padded.

interface Pulse {
  studiedToday: number;
  sameSectionToday: number;
  topSection: { section: string; count: number } | null;
  shareMyWeakest: number;
}
interface Insight { id: string; line: string; basis: number; rung: number }
interface PlanGap { claimedHours: number; observedHours: number; planTooBig: boolean; line: string }

interface Payload {
  pulse: Pulse | null;
  insights: Insight[];
  planGap: PlanGap | null;
}

export function PeerPulseCard() {
  const [data, setData] = useState<Payload | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/student/peer-pulse');
        if (!res.ok) return;
        const json = (await res.json()) as Payload;
        if (!cancelled) setData(json);
      } catch {
        // Silence is the correct failure mode for a card nobody asked for.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!data) return null;

  const { pulse, insights, planGap } = data;

  // The headline is only worth showing when somebody is actually there. One
  // other student is still company; zero is not a fact worth rendering.
  const showPresence = !!pulse && pulse.studiedToday > 0;
  if (!showPresence && insights.length === 0 && !planGap) return null;

  return (
    <Card className="p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
        You&apos;re not doing this alone
      </p>

      {showPresence && pulse && (
        <div className="mt-2">
          <p className="text-[15px] font-bold leading-snug text-stone-900">
            {pulse.studiedToday} {pulse.studiedToday === 1 ? 'student' : 'students'} studied today
            {pulse.sameSectionToday > 0 && (
              <span className="font-semibold text-stone-600">
                {' '}— {pulse.sameSectionToday} on the same section as you
              </span>
            )}
          </p>
          {pulse.topSection && (
            <p className="mt-1 text-[12.5px] text-stone-500">
              Most worked on today: <span className="font-semibold text-stone-700">{pulse.topSection.section}</span>
            </p>
          )}
        </div>
      )}

      {/* Students like you. Each line carries the number of real students behind
          it, so the claim is auditable by the person reading it. */}
      {insights.length > 0 && (
        <ul className="mt-3 space-y-2">
          {insights.map((i) => (
            <li key={i.id} className="rounded-xl bg-stone-50 px-3 py-2">
              <p className="text-[12.5px] font-medium leading-snug text-stone-700">{i.line}</p>
              <p className="mt-0.5 text-[10.5px] text-stone-400">from {i.basis} students like you</p>
            </li>
          ))}
        </ul>
      )}

      {/* The gap between the plan they asked for and the days they actually
          have. Framed at the PLAN, never at the student — see peer-cohort.ts. */}
      {planGap && (
        <div className="mt-3 rounded-xl border border-amber-100 bg-amber-50 px-3 py-2">
          <p className="text-[12.5px] font-medium leading-snug text-amber-900">{planGap.line}</p>
        </div>
      )}
    </Card>
  );
}
