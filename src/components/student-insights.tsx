'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowBigUp, ArrowBigDown, Sparkles, Trophy } from 'lucide-react';
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
  /** Already decided server-side: null means it must not be shown. */
  helpfulCount: number | null;
  canVote: boolean;
  isMine: boolean;
  votedByMe: boolean;
}

interface Payload {
  /** ONE earned item, selected from the same contribution pool as the feed. */
  topPick: Item | null;
  feed: Item[];
  /** This student's position this month. Null until they qualify. */
  myRank: number | null;
}

export function StudentInsights() {
  const [data, setData] = useState<Payload | null>(null);
  const [voted, setVoted] = useState<Record<string, 'up' | 'down'>>({});
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/community/insights');
      if (!res.ok) return;
      setData((await res.json()) as Payload);
    } catch { /* a quiet section beats a broken one */ }
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch, same pattern as the challenge card */
  useEffect(() => { void load(); }, [load]);

  async function vote(item: Item, helpful: boolean) {
    if (busy) return;
    setBusy(item.id);
    // Optimistic: the student's own action is the reward here, so it must land
    // instantly. There is no count to be wrong about.
    setVoted((v) => ({ ...v, [item.id]: helpful ? 'up' : 'down' }));
    try {
      const res = await fetch('/api/community/vote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: item.id, helpful }),
      });
      if (res.ok || res.status === 409) track('community_voted', { helpful });
      else setVoted((v) => { const n = { ...v }; delete n[item.id]; return n; });
    } catch {
      setVoted((v) => { const n = { ...v }; delete n[item.id]; return n; });
    } finally {
      setBusy(null);
    }
  }

  if (!data) return null;

  const { topPick, feed, myRank } = data;
  if (!topPick && feed.length === 0) return <EmptyState />;

  return (
    <div className="space-y-5">
      {/* ── Student Contributors, first and loud (founder, 13 Aug) ─────────
          This sat at the bottom in grey — "you have kept it hidden, such a
          boring thing". It is the whole reason a student writes anything
          here, so it opens the screen instead of closing it.
          Still no leaderboard, no countdown, no participant count: all three
          would report how small the room is. Rank without a vote count is the
          one honest way to show standing at any size. */}
      <div className="rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 p-[1.5px]">
        <div className="rounded-[14.5px] bg-white px-4 py-3.5">
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-amber-400 to-orange-500">
              <Trophy className="h-4 w-4 text-white" />
            </span>
            <p className="text-[14px] font-extrabold text-stone-900">Student Contributors</p>
          </div>
          {myRank != null && (
            <p className="mt-2 inline-block rounded-lg bg-orange-50 px-2.5 py-1 text-[12.5px] font-bold text-orange-700">
              {myRank === 1 ? "You're #1 this month" : `You're #${myRank} this month`}
            </p>
          )}
          <p className="mt-2 text-[12.5px] leading-relaxed text-stone-600">
            Every month, the <b className="text-stone-900">ten most helpful</b> student contributions
            earn a <b className="text-stone-900">free month of Buddy</b>.
          </p>
        </div>
      </div>

      {topPick && (
        <section>
          <SectionLabel>Today&apos;s Pick</SectionLabel>
          <div className="mt-2">
            <Card item={topPick} featured voted={voted} onVote={vote} busy={busy} />
          </div>
        </section>
      )}

      {feed.length > 0 && (
        <section>
          <SectionLabel>Student Insights</SectionLabel>
          <p className="mt-0.5 text-[11.5px] text-stone-400">
            Questions, shortcuts and lessons from students preparing alongside you.
          </p>
          <div className="mt-2.5 space-y-2">
            {feed.map((item) => (
              <Card key={item.id} item={item} voted={voted} onVote={vote} busy={busy} />
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
  item, featured, voted, onVote, busy,
}: {
  item: Item;
  featured?: boolean;
  voted: Record<string, 'up' | 'down'>;
  onVote: (item: Item, helpful: boolean) => void;
  busy: string | null;
}) {
  const myVote = voted[item.id];
  const done = !!myVote || item.votedByMe;

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

        {/* Votes. No number unless the server sent one, which it only does once
            the number is worth seeing. Until then the student's own tap is the
            whole feedback — and that is genuinely enough. */}
        {item.isMine ? null : done ? (
          <span className="text-[11.5px] font-semibold text-teal-700">
            {myVote === 'down' ? 'Noted' : 'Marked helpful'}
          </span>
        ) : (
          <div className="flex items-center gap-1">
            <button
              type="button"
              aria-label="Helpful"
              disabled={busy === item.id}
              onClick={() => onVote(item, true)}
              className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-stone-500 transition-colors hover:bg-stone-100 hover:text-teal-700 active:scale-95 disabled:opacity-50"
            >
              <ArrowBigUp className="h-[18px] w-[18px]" />
              {item.helpfulCount != null && (
                <span className="text-[12px] font-bold">{item.helpfulCount}</span>
              )}
            </button>
            <button
              type="button"
              aria-label="Not useful"
              disabled={busy === item.id}
              onClick={() => onVote(item, false)}
              className="rounded-lg px-2 py-1 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700 active:scale-95 disabled:opacity-50"
            >
              <ArrowBigDown className="h-[18px] w-[18px]" />
            </button>
          </div>
        )}
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
