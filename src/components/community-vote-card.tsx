'use client';

import { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Share2 } from 'lucide-react';
import { shareChallenge } from '@/lib/share-challenge';
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
  const [questions, setQuestions] = useState<VoteItem[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sharedId, setSharedId] = useState<string | null>(null);

  async function share(item: VoteItem) {
    const result = await shareChallenge(
      { section: item.section, topic: item.topic, text: item.text, options: item.options, imageUrl: item.imageUrl },
      'daily_pick',
    );
    if (result === 'copied') setSharedId(item.id);
  }

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/community/voting');
      if (!res.ok) return;
      const json = await res.json();
      setTip(json.tip ?? null);
      setQuestions((json.questions as VoteItem[]) ?? []);
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
  if (!loaded || (!tip && questions.length === 0)) return null;

  // Reddit-density typography (founder, 25 Jul): 13px body, 11-12px meta,
  // tight paddings — small but readable, so three section questions fit
  // without a scroll marathon.
  const block = (item: VoteItem | null, label: string) => {
    if (!item) return null;
    const voted = votedIds.has(item.id);
    return (
      <div className="rounded-xl border border-stone-200 bg-white p-2.5">
        <p className="text-[9.5px] font-bold uppercase tracking-wider text-stone-400">
          {label}{item.section ? ` · ${item.section}` : ''}{item.topic ? ` · ${item.topic}` : ''}
        </p>

        {item.text && (
          <p className="mt-1 whitespace-pre-line text-[13px] leading-snug text-stone-900">
            {item.text}
          </p>
        )}
        {item.options && item.options.length > 0 && (
          <ol className="mt-1 space-y-px text-[11.5px] leading-snug text-stone-600">
            {item.options.map((o, i) => (
              <li key={i}>{String.fromCharCode(65 + i)}. {o}</li>
            ))}
          </ol>
        )}
        {item.imageUrl && (
          /* eslint-disable-next-line @next/next/no-img-element -- storage URL, dimensions unknown */
          <img src={item.imageUrl} alt="Community question" className="mt-1 max-h-60 w-full rounded-lg border border-stone-100 object-contain" />
        )}

        {voted ? (
          <p className="mt-1.5 text-[11px] font-semibold text-emerald-700">
            Counted 🙌 — that helps the next student.
          </p>
        ) : (
          <div className="mt-1.5 flex items-center gap-1.5">
            <p className="min-w-0 flex-1 text-[10.5px] leading-snug text-stone-500">
              {item.prompt} <span className="text-stone-300">· {item.displayName}</span>
            </p>
            <button
              type="button" disabled={busy === item.id}
              onClick={() => void vote(item, true)}
              aria-label="Yes"
              className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-900 px-2.5 py-1.5 text-[11px] font-bold text-white active:scale-[0.96] disabled:opacity-50"
            >
              <ThumbsUp className="h-3 w-3" /> Yes
            </button>
            <button
              type="button" disabled={busy === item.id}
              onClick={() => void vote(item, false)}
              aria-label="No"
              className="flex shrink-0 items-center gap-1 rounded-lg bg-stone-100 px-2.5 py-1.5 text-[11px] font-bold text-stone-500 active:scale-[0.96] disabled:opacity-50"
            >
              <ThumbsDown className="h-3 w-3" /> No
            </button>
          </div>
        )}

        {/* The viral loop, minimum form: forward the QUESTION to the study
            group — solvable right in WhatsApp, CareerRai as one quiet line. */}
        {item.kind === 'question' && (
          <button
            type="button" onClick={() => void share(item)}
            className="mt-1.5 flex items-center gap-1 text-[10.5px] font-semibold text-stone-400 active:text-stone-600"
          >
            <Share2 className="h-3 w-3" />
            {sharedId === item.id ? 'Copied — paste it in your group' : 'Challenge your friends — see how many can solve it'}
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {block(tip, '💡 Tip')}
      {/* One per section, every day — QA, DILR and VARC all get judged.
          Long formats (RC sets, DI grids) arrive as student photos. */}
      {questions.map((q) => block(q, '📷 Question'))}
    </div>
  );
}
