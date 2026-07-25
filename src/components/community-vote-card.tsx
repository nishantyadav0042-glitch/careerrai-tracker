'use client';

import { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Users } from 'lucide-react';
import { track } from '@/lib/journey';

// The Curriculum Selection card — one tip and one question a day, judged.
//
// The student isn't scrolling a feed or liking posts: they're deciding, with
// everyone else, what tomorrow's curriculum should include. No vote counts
// shown (first votes herd later ones), no names (a random first name only),
// no comments, nothing to scroll. Vote → thank you → gone until tomorrow.

interface VoteItem {
  id: string; kind: string; section: string | null; topic: string | null;
  text: string | null; options: string[] | null; imageUrl: string | null;
  displayName: string; prompt: string;
}

export function CommunityVoteCard() {
  const [tip, setTip] = useState<VoteItem | null>(null);
  const [question, setQuestion] = useState<VoteItem | null>(null);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/community/voting');
      if (!res.ok) return;
      const json = await res.json();
      setTip(json.tip ?? null);
      setQuestion(json.question ?? null);
    } catch { /* render nothing */ }
    setLoaded(true);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  async function vote(item: VoteItem, helpful: boolean) {
    setBusy(item.id);
    try {
      const res = await fetch('/api/community/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: item.id, helpful }),
      });
      if (res.ok || res.status === 409) {
        track('community_voted', { kind: item.kind, helpful });
        setVotedIds((prev) => new Set(prev).add(item.id));
      }
    } catch { /* leave as-is */ }
    setBusy(null);
  }

  // Nothing in the pool → no card. Empty community surfaces advertise
  // emptiness, which is worse than absence.
  if (!loaded || (!tip && !question)) return null;

  const block = (item: VoteItem | null, label: string) => {
    if (!item) return null;
    const voted = votedIds.has(item.id);
    return (
      <div className="rounded-xl border border-stone-200 p-3">
        <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
          {label}{item.section ? ` · ${item.section}` : ''}{item.topic ? ` · ${item.topic}` : ''}
        </p>

        {item.text && (
          <p className="mt-1.5 text-[14px] font-medium leading-relaxed text-stone-900">
            &ldquo;{item.text}&rdquo;
          </p>
        )}
        {item.options && item.options.length > 0 && (
          <ol className="mt-1.5 space-y-0.5 text-[12px] text-stone-600">
            {item.options.map((o, i) => (
              <li key={i}>{String.fromCharCode(65 + i)}. {o}</li>
            ))}
          </ol>
        )}
        {item.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- storage URL, dimensions unknown */
          <img src={item.imageUrl} alt="Community question" className="mt-1.5 max-h-72 w-full rounded-lg border border-stone-100 object-contain" />
        )}
        <p className="mt-1 text-[11px] text-stone-400">— {item.displayName}, CareerRai student</p>

        {voted ? (
          <p className="mt-2.5 text-[12px] font-semibold text-emerald-700">
            Counted. You just helped pick tomorrow&apos;s curriculum.
          </p>
        ) : (
          <>
            <p className="mt-2.5 text-[12px] font-semibold text-stone-700">{item.prompt}</p>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button" disabled={busy === item.id}
                onClick={() => void vote(item, true)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-stone-900 py-2 text-[12px] font-bold text-white active:scale-[0.98] disabled:opacity-50"
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Yes
              </button>
              <button
                type="button" disabled={busy === item.id}
                onClick={() => void vote(item, false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-stone-100 py-2 text-[12px] font-bold text-stone-600 active:scale-[0.98] disabled:opacity-50"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> No
              </button>
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-stone-900">
          <Users className="h-4 w-4 text-white" />
        </span>
        <h2 className="text-sm font-bold text-stone-900">You decide the curriculum</h2>
      </div>
      <div className="mt-3 space-y-2.5">
        {block(tip, '💡 Student tip')}
        {block(question, '📷 Student question')}
      </div>
    </div>
  );
}
