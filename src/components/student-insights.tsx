'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowBigUp, ArrowBigDown, Sparkles } from 'lucide-react';
import { track } from '@/lib/journey';

// ── Student Insights — the community loop ───────────────────────────────────
//
// Not "Community": that word makes a student expect comments, groups, threads
// and followers, and we have none of those. "Student Insights" promises exactly
// what is here — questions, shortcuts and lessons from other CAT students.
//
// THE RULE THIS SCREEN IS BUILT AROUND: no small numbers, anywhere. There is no
// vote count on a card, no contribution total, no member count, no "3 people
// found this helpful". The server does not even send the number until it is
// large enough to be evidence rather than an admission.
//
// What carries the signal instead is RANK — one Top Pick a day, chosen from
// what students actually found useful. "Today's Top Pick" is a strong claim
// that reveals nothing about scale, and it is true at 300 students and at
// 300,000.
//
// Visual brief was clean and aesthetic, not busy. So: one column, generous
// space, two vote actions, no chips, no badges, no counters, nothing that
// blinks. The contributions are the content; the interface should get out of
// their way.

interface Item {
  id: string;
  kind: 'question' | 'tip';
  text: string;
  section: string | null;
  displayName: string | null;
  imageUrl: string | null;
  /** "% found this useful", or null below the sample floor. NEVER a raw
   *  count — founder, 20 Aug: the count is what makes the room look small. */
  helpfulPct: number | null;
  canVote: boolean;
  isMine: boolean;
  /** My CURRENT vote — changeable and removable, not a one-shot. */
  myVote: 'up' | 'down' | null;
}

interface Payload {
  /** ONE earned item, selected from the same contribution pool as the feed. */
  topPick: Item | null;
  feed: Item[];
}

export function StudentInsights() {
  const [data, setData] = useState<Payload | null>(null);
  // Tab (founder, 20 Aug): Top = best rises by net score; New = newest first
  // so fresh contributions stay discoverable. Two orderings, not one clever
  // one — the server sends both, the tab just picks.
  const [tab, setTab] = useState<'top' | 'new'>('top');
  // My current vote per item + optimistic score deltas, reconciled on load().
  const [myVotes, setMyVotes] = useState<Record<string, 'up' | 'down' | null>>({});
  const [scoreDelta, setScoreDelta] = useState<Record<string, number>>({});
  // A SET, not a single id. This used to be one nullable id used as a global
  // lock, with a guard at the top of vote() that returned whenever ANY vote
  // was in flight — so every other tap was silently dropped. On a phone that is a
  // 200-800ms window per tap, and the other buttons still looked tappable:
  // a student scrolling a feed and voting on four cards landed one.
  // Votes are independent rows on independent items, so they run in parallel;
  // only a second tap on the SAME item is blocked.
  const [busy, setBusy] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/community/insights');
      if (!res.ok) return;
      setData((await res.json()) as Payload);
    } catch { /* a quiet section beats a broken one */ }
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, same pattern as the challenge card */
  useEffect(() => { void load(); }, [load]);

  /** score contribution of a vote state: up=+1, down=−1, none=0. */
  const weight = (v: 'up' | 'down' | null | undefined) => (v === 'up' ? 1 : v === 'down' ? -1 : 0);

  async function vote(item: Item, dir: 'up' | 'down') {
    if (busy.has(item.id)) return;
    const prev = myVotes[item.id] !== undefined ? myVotes[item.id] : item.myVote;
    // Tapping my current vote removes it; tapping the other switches it.
    const next: 'up' | 'down' | null = prev === dir ? null : dir;
    setBusy((b) => new Set(b).add(item.id));
    // Optimistic — and REVERTED if the server says no. The UI never keeps a
    // vote the database rejected.
    setMyVotes((v) => ({ ...v, [item.id]: next }));
    setScoreDelta((d) => ({ ...d, [item.id]: (d[item.id] ?? 0) + weight(next) - weight(prev) }));
    try {
      const res = await fetch('/api/community/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: item.id, dir: next }),
      });
      if (res.ok) {
        track('community_voted', { dir: next ?? 'removed', from: prev ?? 'none' });
      } else {
        setMyVotes((v) => ({ ...v, [item.id]: prev ?? null }));
        setScoreDelta((d) => ({ ...d, [item.id]: (d[item.id] ?? 0) - (weight(next) - weight(prev)) }));
      }
    } catch {
      setMyVotes((v) => ({ ...v, [item.id]: prev ?? null }));
      setScoreDelta((d) => ({ ...d, [item.id]: (d[item.id] ?? 0) - (weight(next) - weight(prev)) }));
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(item.id); return n; });
    }
  }

  if (!data) return null;

  const { topPick, feed } = data;
  if (!topPick && feed.length === 0) return <EmptyState />;

  const liveVote = (i: Item) => (myVotes[i.id] !== undefined ? myVotes[i.id] : i.myVote);
  // Ranking still runs on the real score — it is just never printed. The
  // server sends the feed already ordered; scoreDelta only nudges the local
  // ordering so a fresh vote moves the card the student just voted on.
  const ordered = tab === 'top'
    ? [...feed].sort((a, b) => (scoreDelta[b.id] ?? 0) - (scoreDelta[a.id] ?? 0))
    : feed;

  return (
    <div className="space-y-5">
      {/* The contributor leaderboard stood here until 20 Aug. Founder ruling:
          no superstars — no names, no profiles, no rank, no reward for
          posting. A student who shares a tough question should be
          doing it because the next student gets un-stuck, not to climb a
          board. What replaces it is nothing at all: the content is the
          surface, and the vote count on their own card is the only signal
          a contributor needs. */}
      {topPick && (
        <section>
          <SectionLabel>Today&apos;s Pick</SectionLabel>
          <div className="mt-2">
            <Card item={topPick} featured myVote={liveVote(topPick)} onVote={vote} busy={busy} />
          </div>
        </section>
      )}

      {feed.length > 0 && (
        <section>
          <div className="flex items-end justify-between">
            <div>
              <SectionLabel>Student Insights</SectionLabel>
              <p className="mt-0.5 text-[11.5px] text-stone-400">
                Questions, shortcuts and lessons from students preparing alongside you.
              </p>
            </div>
            <div className="flex gap-1">
              {(['top', 'new'] as const).map((t) => (
                <button
                  key={t} type="button" onClick={() => setTab(t)}
                  className={`rounded-full px-3 py-1 text-[11px] font-bold ${tab === t ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500'}`}
                >
                  {t === 'top' ? 'Top' : 'New'}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2.5 space-y-2">
            {ordered.map((item) => (
              <Card key={item.id} item={item} myVote={liveVote(item)} onVote={vote} busy={busy} />
            ))}
          </div>
        </section>
      )}

    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10.5px] font-bold uppercase tracking-[0.15em] text-stone-400">{children}</p>
  );
}

function Card({
  item, featured, myVote, onVote, busy,
}: {
  item: Item;
  featured?: boolean;
  myVote: 'up' | 'down' | null;
  onVote: (item: Item, dir: 'up' | 'down') => void;
  busy: Set<string>;
}) {
  return (
    <article
      className={
        featured
          ? 'rounded-2xl border border-indigo-100 bg-indigo-50/40 p-4'
          : 'rounded-2xl border border-stone-200 bg-white p-4'
      }
    >
      {featured && (
        <p className="mb-1.5 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider text-indigo-600">
          <Sparkles className="h-3 w-3" />
          {item.kind === 'question' ? 'Top question' : 'Top insight'}
        </p>
      )}

      {item.text && (
        <p className="text-[14.5px] font-medium leading-relaxed text-stone-900">{item.text}</p>
      )}
      {item.imageUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.imageUrl} alt="" className="mt-2.5 w-full rounded-xl border border-stone-200" />
      )}

      <div className="mt-3 flex items-center justify-between">
        {/* A byline is earned by a student, never taken by us. Curated rows
            arrive with displayName null and show their section alone —
            signing our own content as a peer contribution is exactly what
            this feed must not do. */}
        <p className="text-[11.5px] text-stone-400">
          {item.isMine ? 'Yours' : item.displayName ? `— ${item.displayName}` : null}
          {item.section && (item.isMine || item.displayName) && <span className="ml-1.5 text-stone-300">·</span>}
          {item.section && <span className={item.isMine || item.displayName ? 'ml-1.5' : ''}>{item.section}</span>}
        </p>

        {/* No counts, ever (founder, 20 Aug: they are small, and a small
            number announces the size of the room). What a vote visibly does
            instead: your button lights up and stays lit — tap it again to
            take the vote back, tap the other to switch — and the item moves
            in the ranking. A "% found this useful" joins in once enough
            students have voted for a ratio to mean anything; below that
            floor there is no number at all, because a percentage from two
            votes is a worse lie than the two votes were. */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            disabled={busy.has(item.id) || !item.canVote}
            onClick={() => onVote(item, 'up')}
            aria-label="Helps for CAT"
            className={`inline-flex items-center gap-1 rounded-lg px-2 py-1.5 text-[11.5px] font-bold transition-transform active:scale-95 disabled:opacity-40 ${
              myVote === 'up' ? 'border border-teal-300 bg-teal-100 text-teal-800' : 'border border-teal-200 bg-teal-50 text-teal-700'
            }`}
          >
            <ArrowBigUp className={`h-4 w-4 ${myVote === 'up' ? 'fill-teal-600' : ''}`} />
            Helps for CAT
          </button>
          {item.helpfulPct != null && (
            <span className="text-[11.5px] font-bold text-teal-700">
              {item.helpfulPct}% found this useful
            </span>
          )}
          <button
            type="button"
            disabled={busy.has(item.id) || !item.canVote}
            onClick={() => onVote(item, 'down')}
            aria-label="Not helpful"
            className={`inline-flex items-center rounded-lg px-2 py-1.5 transition-colors active:scale-95 disabled:opacity-40 ${
              myVote === 'down' ? 'bg-stone-200 text-stone-700' : 'text-stone-400 hover:bg-stone-100 hover:text-stone-600'
            }`}
          >
            <ArrowBigDown className={`h-4 w-4 ${myVote === 'down' ? 'fill-stone-500' : ''}`} />
          </button>
        </div>
      </div>
    </article>
  );
}

/**
 * The empty state matters more than the full one at our size — it is what the
 * first contributor sees. So it does not apologise, does not say "no posts
 * yet", and above all does not report how many contributions exist. It makes an
 * invitation, which is the only honest and useful thing to do with an empty
 * shelf.
 */
function EmptyState() {
  return (
    <div className="rounded-2xl border border-dashed border-stone-300 bg-white px-4 py-6 text-center">
      <p className="text-[14px] font-bold text-stone-800">Be the one who adds something</p>
      <p className="mx-auto mt-1.5 max-w-[15rem] text-[12.5px] leading-relaxed text-stone-500">
        A question worth asking, a shortcut you found, or something you learned the hard way.
        The next student gets it tomorrow.
      </p>
    </div>
  );
}
