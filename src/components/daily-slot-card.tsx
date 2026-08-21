'use client';

import { useEffect, useState } from 'react';
import { track } from '@/lib/journey';
import { CommunityVoteCard } from '@/components/community-vote-card';
import { DailyChallengeCard } from '@/components/daily-challenge-card';

// ── Today's ONE thing on Daily Pick ─────────────────────────────────────────
//
// Renders whatever the rotation chose. The scarcity is the feature: there is
// exactly one card and no way to pull a second, because the student must still
// leave this screen having prepared rather than having browsed.
//
// The community kind delegates to the card that already exists — the rotation
// changes WHEN voting is asked for, never how it works.

type Kind = 'question' | 'community' | 'mirror' | 'peer' | 'reflection';

interface Slot {
  kind: Kind | null;
  label?: string;
  text?: string | null;
  basis?: number | null;
  pulse?: { studiedToday: number; sameSectionToday: number; topSection: { section: string; count: number } | null } | null;
}

export function DailySlotCard() {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [failed, setFailed] = useState(false);
  const [reflected, setReflected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/community/daily-slot');
        if (!res.ok) { if (!cancelled) setFailed(true); return; }
        const json = (await res.json()) as Slot;
        if (cancelled) return;
        setSlot(json);
        if (json.kind) track('daily_slot_served', { kind: json.kind });
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── One screen, every day (founder, 13 Aug) ─────────────────────────────
  //
  // The rotation used to hand a different CARD to the hero slot each day —
  // question, community ballot, mirror, peer stat, reflection — so Daily Pick
  // looked like a different product depending on when you opened it. His
  // words: "2 different screens are live… this mix of screen should not
  // exist."
  //
  // It was built as a curiosity engine, and variety was the point. But the
  // variety cost the one thing a daily habit needs most: a student has to know
  // what they are opening BEFORE they open it. A timed question every day is a
  // reason to come back; a surprise format is a reason to bounce.
  //
  // So the question always wins the hero slot when one exists. The other kinds
  // are not deleted — they still render below when there is no question for
  // the day, which keeps the rotation engine and its tests intact.
  // FIXED 21 Aug: a failed slot read used to silently swap the student onto
  // the community ballot — a different product with no hint anything broke,
  // and a blank page when the ballot was also empty. An outage is an outage:
  // say so, offer retry.
  if (failed) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
        <p className="text-[13px] font-semibold text-stone-700">Couldn’t load today’s pick.</p>
        <button type="button" onClick={() => window.location.reload()} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[12.5px] font-bold text-white">
          Try again
        </button>
      </div>
    );
  }
  if (!slot) return null;
  if (slot.kind === 'question') return <DailyChallengeCard />;
  if (slot.kind === 'community' || slot.kind === null) return <CommunityVoteCard />;
  // The question slot renders the challenge system that ALREADY EXISTS rather
  // than a second implementation of "a question a day". Founder, 12 Aug: do not
  // build a duplicate of Daily Pick, and do not run both — pick one and remove
  // the other. Daily Pick wins the surface (it owns the nav slot and the
  // student's mental model); the challenge stack wins the engine (it already
  // captures choice, correctness and seconds-taken, and already refuses to show
  // a community split below 20 attempts). Neither is rebuilt; the rotation just
  // decides which day each one gets.
  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[10.5px] font-bold uppercase tracking-widest text-indigo-500">{slot.label}</p>

      {slot.text && (
        <p className="mt-2 text-[15px] font-semibold leading-relaxed text-stone-900">{slot.text}</p>
      )}

      {/* Where the claim came from, shown rather than asserted. */}
      {slot.kind === 'peer' && slot.basis != null && (
        <p className="mt-1.5 text-[11px] text-stone-400">from {slot.basis} students like you</p>
      )}

      {slot.kind === 'peer' && slot.pulse && slot.pulse.studiedToday > 0 && (
        <p className="mt-2 rounded-xl bg-stone-50 px-3 py-2 text-[12.5px] font-medium text-stone-600">
          {slot.pulse.studiedToday} {slot.pulse.studiedToday === 1 ? 'student' : 'students'} studied today
          {slot.pulse.topSection && <> · most on <span className="font-bold text-stone-800">{slot.pulse.topSection.section}</span></>}
        </p>
      )}

      {/* Reflection asks for nothing back. A prompt with a mandatory text box
          is homework, and homework is what this slot exists to NOT be — the
          thinking is the point, the typing is optional. */}
      {slot.kind === 'reflection' && (
        reflected ? (
          <p className="mt-3 text-[12.5px] font-medium text-teal-700">✓ Noted. That is the whole exercise.</p>
        ) : (
          <button
            type="button"
            onClick={() => { setReflected(true); track('daily_slot_reflected', {}); }}
            className="mt-3 rounded-xl border border-stone-300 bg-white px-4 py-2 text-[13px] font-semibold text-stone-700 transition-transform active:scale-95"
          >
            Thought about it
          </button>
        )
      )}
    </div>
  );
}
