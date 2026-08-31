'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowBigUp, ArrowBigDown, Sparkles } from 'lucide-react';
import { track } from '@/lib/journey';
import { ReportItem } from '@/components/report-item';

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
  /** Real net vote score, sent so the Top tab ranks on actual votes —
   *  displayed nowhere (the no-small-numbers rule is about display). */
  netScore?: number;
  /** "% found this useful", or null below the sample floor. NEVER a raw
   *  count — founder, 20 Aug: the count is what makes the room look small. */
  helpfulPct: number | null;
  canVote: boolean;
  isMine: boolean;
  /** My CURRENT vote — changeable and removable, not a one-shot. */
  myVote: 'up' | 'down' | null;
}

interface Payload {
  /** The feed ONLY. Today's pick is rendered by the Daily Pick card above,
   *  from the same endpoint, and the server removes it from this list — a
   *  student must never meet the same submission twice on one screen. */
  feed: Item[];
  pageSize?: number;
  /** The caller's own latest share — impact, not status. Nobody else's. */
  myShare?: (Item & { status?: string; featuredToday?: boolean; totalVotes?: number }) | null;
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
  // Hardening sprint (21 Aug): a failed load used to render NOTHING — the
  // student could not tell an outage from an empty community, and had no way
  // to retry. Every load now ends in data or in a visible retryable state.
  const [loadFailed, setLoadFailed] = useState(false);
  const [visible, setVisible] = useState(8);
  // A dropped vote must SAY so — the optimistic revert alone just un-lights
  // a button the student may not even be looking at.
  const [voteError, setVoteError] = useState<string | null>(null);
  // Reported items disappear for this student immediately — their report is
  // honoured in their own view (the report sheet has promised this in its
  // header comment since it shipped; the feed never implemented it).
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    setLoadFailed(false);
    try {
      const res = await fetch('/api/community/insights');
      if (!res.ok) { setLoadFailed(true); return; }
      setData((await res.json()) as Payload);
    } catch { setLoadFailed(true); }
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
        setVoteError(null);
        track('community_voted', { dir: next ?? 'removed', from: prev ?? 'none' });
      } else {
        setMyVotes((v) => ({ ...v, [item.id]: prev ?? null }));
        setScoreDelta((d) => ({ ...d, [item.id]: (d[item.id] ?? 0) - (weight(next) - weight(prev)) }));
        setVoteError('That vote didn’t save — tap it again.');
      }
    } catch {
      setMyVotes((v) => ({ ...v, [item.id]: prev ?? null }));
      setScoreDelta((d) => ({ ...d, [item.id]: (d[item.id] ?? 0) - (weight(next) - weight(prev)) }));
      setVoteError('That vote didn’t save — tap it again.');
    } finally {
      setBusy((b) => { const n = new Set(b); n.delete(item.id); return n; });
    }
  }

  if (loadFailed) {
    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center">
        <p className="text-[13px] font-semibold text-stone-700">Couldn’t load the community right now.</p>
        <button type="button" onClick={() => void load()} className="mt-3 rounded-xl bg-stone-900 px-4 py-2 text-[12.5px] font-bold text-white">
          Try again
        </button>
      </div>
    );
  }
  if (!data) return null;

  const { feed } = data;
  if (feed.length === 0 && !data.myShare) return <EmptyState />;

  const liveVote = (i: Item) => (myVotes[i.id] !== undefined ? myVotes[i.id] : i.myVote);
  // Ranking still runs on the real score — it is just never printed. The
  // server sends the feed already ordered; scoreDelta only nudges the local
  // ordering so a fresh vote moves the card the student just voted on.
  // Top ranks on the REAL score the server sends (fixed 21 Aug — it used to
  // sort on a delta map that is empty on load, so Top rendered the New
  // order); the local delta only nudges a card the student just voted on.
  const ordered = tab === 'top'
    ? [...feed].sort((a, b) => ((b.netScore ?? 0) + (scoreDelta[b.id] ?? 0)) - ((a.netScore ?? 0) + (scoreDelta[a.id] ?? 0)))
    : feed;
  const page = ordered.filter((i) => !hidden.has(i.id)).slice(0, visible);

  return (
    <div className="space-y-5">
      {/* The contributor leaderboard stood here until 20 Aug. Founder ruling:
          no superstars — no names, no profiles, no rank, no reward for
          posting. A student who shares a tough question should be
          doing it because the next student gets un-stuck, not to climb a
          board. What replaces it is nothing at all: the content is the
          surface, and the vote count on their own card is the only signal
          a contributor needs. */}
      {feed.length > 0 && (
        <section>
          <div className="flex items-end justify-between">
            <div>
              {/* RENAMED 31 Aug. Both halves of the old line had become false.
                  It promised questions — there are none left on this tab, the
                  feed is hints-only. And it credited peers as the authors,
                  when nobody ever wrote one: in six weeks the surface took a
                  single non-curated submission, and it was the founder's own
                  test post. Claiming peer authorship over content we wrote
                  ourselves is the exact thing the byline rule below exists to
                  prevent, and the section header was doing it. */}
              <SectionLabel>More hints</SectionLabel>
              <p className="mt-0.5 text-[11.5px] text-stone-400">
                Shortcuts and lessons worth keeping. Vote on the ones that helped.
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
          {voteError && <p className="mt-2 text-[11.5px] font-semibold text-rose-600">{voteError}</p>}
          <div className="mt-2.5 space-y-2">
            {page.map((item) => (
              <Card
                key={item.id} item={item} myVote={liveVote(item)} onVote={vote} busy={busy}
                onReported={() => setHidden((h) => new Set(h).add(item.id))}
              />
            ))}
          </div>
          {ordered.length > visible && (
            // FEED_PAGE_SIZE promised a "See more" that never existed — past
            // the 8 newest, a contribution was permanently invisible.
            <button
              type="button" onClick={() => setVisible((v) => v + 8)}
              className="mt-2.5 w-full rounded-xl border border-stone-200 bg-white py-2.5 text-[12.5px] font-bold text-stone-600"
            >
              See more
            </button>
          )}
        </section>
      )}

      {/* Impact, not status: the contributor's own latest share, its honest
          state, and its own reception — visible to them alone. No rank, no
          board, no reward, no comparison with anyone. */}
      {data.myShare && (
        <section>
          <SectionLabel>Your share</SectionLabel>
          <div className="mt-2 rounded-2xl border border-stone-200 bg-white p-4">
            {data.myShare.text && <p className="text-[13.5px] leading-relaxed text-stone-800">{data.myShare.text}</p>}
            <p className="mt-2 text-[11.5px] text-stone-500">
              {data.myShare.status === 'live'
                ? data.myShare.featuredToday
                  ? 'Today’s Pick — the whole community is seeing this today.'
                  : data.myShare.helpfulPct != null
                    ? `Live in the pool · ${data.myShare.helpfulPct}% found it useful`
                    : (data.myShare.totalVotes ?? 0) > 0
                      ? 'Live in the pool — students are voting on it.'
                      : 'Live in the pool — students will see it in the rotation.'
                : data.myShare.status === 'pending'
                  ? 'Being checked — not visible to students yet.'
                  : 'Not published.'}
            </p>
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
  item, featured, myVote, onVote, busy, onReported,
}: {
  item: Item;
  featured?: boolean;
  myVote: 'up' | 'down' | null;
  onVote: (item: Item, dir: 'up' | 'down') => void;
  busy: Set<string>;
  onReported?: () => void;
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
        <img
          src={item.imageUrl} alt=""
          className="mt-2.5 max-h-80 w-full rounded-xl border border-stone-200 object-contain"
          // A missing storage object must degrade to a text card, never leave
          // a card that is nothing but a byline and two buttons.
          onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
        />
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
      {!item.isMine && (
        <div className="mt-2 flex">
          <ReportItem submissionId={item.id} onReported={onReported} />
        </div>
      )}
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
