'use client';

import { useEffect, useState } from 'react';

// Verified student contributions, injected into the curriculum at the exact
// topic they're about. Appears inside the study plan when a student opens a
// topic — never anywhere else. "By the students, for the students" as
// product architecture, not marketing: student A's hard-won lesson shows up
// where student B is about to need it.
//
// Renders NOTHING when a topic has no verified insights — an empty community
// section would advertise emptiness.

interface Insight { kind: string; text: string; name: string | null; curated: boolean }

const FRAME: Record<string, { emoji: string; label: string; tone: string }> = {
  tip:      { emoji: '💡', label: 'Student tip',           tone: 'bg-indigo-50 text-indigo-900' },
  mistake:  { emoji: '⚠️', label: 'Common mistake',        tone: 'bg-amber-50 text-amber-900' },
  shortcut: { emoji: '⚡', label: 'Shortcut from a student', tone: 'bg-emerald-50 text-emerald-900' },
};

// Curated stock carries no student label at all — not in the heading, not in
// the byline. TRUST-OS rule 1: our own words never wear a student's name.
const CURATED_LABEL: Record<string, string> = {
  tip: 'CAT tip', mistake: 'Common mistake', shortcut: 'Shortcut',
};

// Module-level cache: several topics can expand in one session and the plan
// card re-renders often — one fetch per topic set per page view is plenty.
const cache = new Map<string, Insight[]>();

export function TopicInsights({ topic }: { topic: string }) {
  const [items, setItems] = useState<Insight[] | null>(cache.get(topic) ?? null);

  useEffect(() => {
    if (cache.has(topic)) return;
    let dead = false;
    (async () => {
      try {
        const res = await fetch(`/api/community/insights?topics=${encodeURIComponent(topic)}`);
        if (!res.ok) return;
        const json = await res.json();
        const got = (json.insights?.[topic] as Insight[]) ?? [];
        cache.set(topic, got);
        if (!dead) setItems(got);
      } catch { /* show nothing */ }
    })();
    return () => { dead = true; };
  }, [topic]);

  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {items.map((ins, i) => {
        const f = FRAME[ins.kind] ?? FRAME.tip;
        return (
          <div key={i} className={`rounded-xl px-2.5 py-2 text-[12px] leading-relaxed ${f.tone}`}>
            <span className="font-bold">
              {f.emoji} {ins.curated ? (CURATED_LABEL[ins.kind] ?? 'CAT tip') : f.label}:
            </span> {ins.text}
            {/* Only a real student gets a byline (founder, 13 Aug). Curated
                lines carry none — the kind label above already says what this
                is, and signing it ourselves adds nothing a student wants. */}
            {!ins.curated && ins.name && (
              <span className="mt-0.5 block text-[10px] opacity-70">— {ins.name}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}
