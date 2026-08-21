'use client';

import { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Share2 } from 'lucide-react';
import { shareChallenge } from '@/lib/share-challenge';
import { ReportItem } from '@/components/report-item';
import { track } from '@/lib/journey';

// ── THE Daily Pick card ─────────────────────────────────────────────────────
//
// One canonical Daily Pick surface (21 Aug consolidation). This card used to
// be a BALLOT: it called its own endpoint, ran its own selection over the
// live pool (one tip plus one question per section), AND rendered today's
// featured items — while StudentInsights, directly below it on the same
// screen, independently read the same featured_on stamp and rendered the SAME
// question again under "Today's Pick". Two endpoints, two selection
// universes, two vote-state models, one screen. A student saw today's
// question twice, and whether their vote could be changed at all depended on
// which copy they happened to tap.
//
// Now: daily-pick-rotation decides the KIND, the promoter's featured_on stamp
// decides the ITEM, /api/community/insights is the single endpoint serving
// both this card and the feed, and it removes today's pick from the feed
// SERVER-SIDE so no client can drift back into rendering it twice. The ballot
// is retired — Daily Pick is one coherent attention surface, not a "vote on
// four things" game, and the one-shot vote lock is gone with it.
//
// Visually unchanged in spirit (founder, 26 Jul: "conceptually right,
// visually dead"): the pick wears its amber crown, the vote is a decision,
// and there are still no counts, no names, no comments.

interface PickItem {
  id: string;
  kind: 'question' | 'tip';
  text: string;
  section: string | null;
  displayName: string | null;
  imageUrl: string | null;
  helpfulPct: number | null;
  canVote: boolean;
  isMine: boolean;
  /** My CURRENT vote — changeable and removable. The one vote model. */
  myVote: 'up' | 'down' | null;
  prompt?: string;
}

export function CommunityVoteCard() {
  const [pick, setPick] = useState<{ question: PickItem | null; tip: PickItem | null } | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [voteError, setVoteError] = useState<string | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, 'up' | 'down' | null>>({});
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [sharedId, setSharedId] = useState<string | null>(null);
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch('/api/community/insights');
      if (!res.ok) { setLoadFailed(true); setLoaded(true); return; }
      const json = await res.json();
      setPick(json.dailyPick ?? { question: null, tip: null });
      if (json.dailyPick?.question || json.dailyPick?.tip) {
        track('top_pick_shown', {
          question: json.dailyPick?.question?.id ?? null,
          tip: json.dailyPick?.tip?.id ?? null,
        });
      }
    } catch { setLoadFailed(true); }
    setLoaded(true);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  async function share(item: PickItem) {
    const result = await shareChallenge(
      { section: item.section, topic: null, text: item.text, options: null, imageUrl: item.imageUrl },
      'daily_pick',
    );
    if (result === 'copied') setSharedId(item.id);
  }

  /** THE vote model, identical to the feed's: tapping your current vote
   *  removes it, tapping the other switches it. The retired ballot locked a
   *  vote forever after one tap — the same item, two rules, one screen. */
  async function vote(item: PickItem, dir: 'up' | 'down') {
    if (busy.has(item.id)) return;
    const prev = myVotes[item.id] !== undefined ? myVotes[item.id] : item.myVote;
    const next: 'up' | 'down' | null = prev === dir ? null : dir;
    setBusy((b) => new Set(b).add(item.id));
    setMyVotes((v) => ({ ...v, [item.id]: next }));
    try {
      const res = await fetch('/api/community/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: item.id, dir: next }),
      });
      if (res.ok) {
        setVoteError(null);
        track('community_voted', { dir: next ?? 'removed', from: prev ?? 'none', surface: 'daily_pick' });
      } else {
        setMyVotes((v) => ({ ...v, [item.id]: prev ?? null }));
        setVoteError('That vote didn’t save — tap it again.');
      }
    } catch {
      setMyVotes((v) => ({ ...v, [item.id]: prev ?? null }));
      setVoteError('That vote didn’t save — tap it again.');
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(item.id); return n; });
    }
  }

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
        <p className="text-[13px] font-semibold text-stone-700">Couldn’t load today’s pick.</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[12.5px] font-bold text-white">
          Try again
        </button>
      </div>
    );
  }

  const items = [pick?.question, pick?.tip].filter(Boolean) as PickItem[];
  const visible = items.filter((i) => !hidden.has(i.id));
  if (!loaded || visible.length === 0) return null;

  // A byline is EARNED by a student, never taken by us: curated rows arrive
  // with displayName null and stand on their section alone.
  const byline = (item: PickItem) =>
    item.isMine ? 'Yours' : item.displayName ? `— ${item.displayName}` : item.section ?? '';

  const liveVote = (i: PickItem) => (myVotes[i.id] !== undefined ? myVotes[i.id] : i.myVote);

  return (
    <div className="space-y-2">
      {voteError && <p className="text-[11.5px] font-semibold text-rose-600">{voteError}</p>}
      {visible.map((item) => (
        <div
          key={item.id}
          className="rounded-xl border border-l-4 border-amber-200 border-l-amber-500 bg-gradient-to-br from-amber-50 to-white p-3"
        >
          <div className="flex items-center gap-1.5">
            <span className="inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-white">
              🏆 Today&apos;s Pick
            </span>
            <span className="text-[10px] font-bold text-amber-700">
              {item.kind === 'question' ? '📷 Question of the day' : '💡 Tip of the day'}
              {item.section ? ` · ${item.section}` : ''}
            </span>
          </div>

          {item.text && (
            <p className="mt-1.5 whitespace-pre-line text-[13px] font-medium leading-snug text-stone-900">{item.text}</p>
          )}
          {item.imageUrl && (
            /* eslint-disable-next-line @next/next/no-img-element -- storage URL, dimensions unknown */
            <img
              src={item.imageUrl} alt="Today's pick"
              className="mt-1.5 max-h-60 w-full rounded-lg border border-amber-100 object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          {/* The ownership question stays a LINE, not a hint (founder, 26 Jul):
              the vote must feel like a decision, not a reaction. */}
          {item.prompt && <p className="mt-1.5 text-[11px] font-semibold text-stone-500">{item.prompt}</p>}

          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              disabled={busy.has(item.id) || !item.canVote}
              onClick={() => vote(item, 'up')}
              aria-label="Helps for CAT"
              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-bold transition-transform active:scale-95 disabled:opacity-40 ${
                liveVote(item) === 'up' ? 'border border-teal-300 bg-teal-100 text-teal-800' : 'border border-teal-200 bg-teal-50 text-teal-700'
              }`}
            >
              <ThumbsUp className={`h-3.5 w-3.5 ${liveVote(item) === 'up' ? 'fill-teal-600' : ''}`} />
              Helps for CAT
            </button>
            {item.helpfulPct != null && (
              <span className="text-[11.5px] font-bold text-teal-700">{item.helpfulPct}% found this useful</span>
            )}
            <button
              type="button"
              disabled={busy.has(item.id) || !item.canVote}
              onClick={() => vote(item, 'down')}
              aria-label="Not helpful"
              className={`inline-flex items-center rounded-lg px-2 py-1.5 transition-colors active:scale-95 disabled:opacity-40 ${
                liveVote(item) === 'down' ? 'bg-stone-200 text-stone-700' : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
              }`}
            >
              <ThumbsDown className={`h-3.5 w-3.5 ${liveVote(item) === 'down' ? 'fill-stone-500' : ''}`} />
            </button>
            {item.kind === 'question' && (
              <button
                type="button" onClick={() => void share(item)}
                className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11px] font-bold text-stone-500 active:scale-95"
              >
                <Share2 className="h-3.5 w-3.5" />
                {sharedId === item.id ? 'Copied' : 'Challenge a friend'}
              </button>
            )}
          </div>

          <div className="mt-1 flex items-center">
            <p className="text-[10px] text-stone-400">
              {byline(item) ? `${byline(item)} · ` : ''}a new pick every day
            </p>
            {!item.isMine && (
              <ReportItem submissionId={item.id} onReported={() => setHidden((h) => new Set(h).add(item.id))} />
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
