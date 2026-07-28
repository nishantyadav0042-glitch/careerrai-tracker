'use client';

import { useCallback, useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Share2 } from 'lucide-react';
import { shareChallenge } from '@/lib/share-challenge';
import { ReportItem } from '@/components/report-item';
import { track } from '@/lib/journey';

// The Daily Pick judging surface. Compact fonts, but never flat (founder,
// 26 Jul: "conceptually right, visually dead — nowhere the essence of the
// thumbs"). What gives it life:
//   · every block wears its section's colour (tip amber, QA indigo, DILR
//     emerald, VARC rose) — four blocks, four moods, no grey wall
//   · the ownership question is BACK as its own line ("Would this help
//     another CAT aspirant? Your vote decides.") — the vote must feel like a
//     decision, not a reaction
//   · a progress line up top and a small celebration when all four are done
// Still no counts, no names, no comments, no feed.

interface VoteItem {
  id: string; kind: string; section: string | null; topic: string | null;
  text: string | null; options: string[] | null; imageUrl: string | null;
  displayName: string; prompt: string;
}

// Section identities — colour is what separates "alive" from "grey wall".
const TONE: Record<string, { chip: string; border: string; yes: string }> = {
  tip:  { chip: 'bg-amber-100 text-amber-700',   border: 'border-l-amber-400',   yes: 'bg-amber-600' },
  QA:   { chip: 'bg-indigo-100 text-indigo-700', border: 'border-l-indigo-400',  yes: 'bg-indigo-600' },
  DILR: { chip: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-400', yes: 'bg-emerald-600' },
  VARC: { chip: 'bg-rose-100 text-rose-700',     border: 'border-l-rose-400',    yes: 'bg-rose-600' },
};

// Today's Top Pick — the daily rotation's winner (max votes takes the slot for
// exactly one day; with no votes the queue moves up anyway). Displayed, never
// re-balloted: it already had its day of voting, so it renders without thumbs.
type TopPickItem = Omit<VoteItem, 'prompt'>;

export function CommunityVoteCard() {
  const [tip, setTip] = useState<VoteItem | null>(null);
  const [questions, setQuestions] = useState<VoteItem[]>([]);
  const [topPick, setTopPick] = useState<{ question: TopPickItem | null; tip: TopPickItem | null } | null>(null);
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
      setTopPick(json.topPick ?? null);
      if (json.topPick?.question || json.topPick?.tip) {
        track('top_pick_shown', {
          question: json.topPick?.question?.id ?? null,
          tip: json.topPick?.tip?.id ?? null,
        });
      }
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

  const hasTopPick = !!(topPick?.question || topPick?.tip);
  // The top pick must render even when this student has judged everything —
  // hiding the day's winner because YOUR ballot is empty would make the
  // surface look broken to exactly the most engaged voters.
  if (!loaded || (!hasTopPick && !tip && questions.length === 0)) return null;

  const all = [tip, ...questions].filter(Boolean) as VoteItem[];
  const done = all.filter((i) => votedIds.has(i.id)).length;
  const allDone = done === all.length && all.length > 0;

  const block = (item: VoteItem | null, kindLabel: string, toneKey: string) => {
    if (!item) return null;
    const voted = votedIds.has(item.id);
    const tone = TONE[toneKey] ?? TONE.tip;
    return (
      <div key={item.id} className={`rounded-xl border border-l-4 border-stone-200 bg-white p-3 ${tone.border}`}>
        {/* WHAT this is, on top, in its section's colour. */}
        <span className={`inline-block rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider ${tone.chip}`}>
          {kindLabel}{item.topic ? ` · ${item.topic}` : ''}
        </span>

        {item.text && (
          <p className="mt-1.5 whitespace-pre-line text-[13px] leading-snug text-stone-900">
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
          <img src={item.imageUrl} alt="Community question" className="mt-1.5 max-h-60 w-full rounded-lg border border-stone-100 object-contain" />
        )}
        <div className="mt-1 flex items-center">
          <p className="text-[10px] text-stone-400">— {item.displayName}, CareerRai student</p>
          {/* Play UGC compliance: every shared item is reportable in-app. */}
          <ReportItem submissionId={item.id} />
        </div>

        {voted ? (
          <p className="mt-2 text-[11.5px] font-bold text-emerald-700">
            🙌 Counted — you&apos;re deciding what students see next.
          </p>
        ) : (
          <>
            {/* The ownership line — the WHY of the thumbs. */}
            <p className="mt-2 text-[11.5px] font-bold text-stone-800">
              {item.prompt} <span className="font-semibold text-stone-400">Your vote decides.</span>
            </p>
            <div className="mt-1.5 flex gap-1.5">
              <button
                type="button" disabled={busy === item.id}
                onClick={() => void vote(item, true)}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-[12px] font-bold text-white active:scale-[0.97] disabled:opacity-50 ${tone.yes}`}
              >
                <ThumbsUp className="h-3.5 w-3.5" /> Yes, helpful
              </button>
              <button
                type="button" disabled={busy === item.id}
                onClick={() => void vote(item, false)}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-stone-100 py-2 text-[12px] font-bold text-stone-500 active:scale-[0.97] disabled:opacity-50"
              >
                <ThumbsDown className="h-3.5 w-3.5" /> Not really
              </button>
            </div>
          </>
        )}

        {item.kind === 'question' && (
          <button
            type="button" onClick={() => void share(item)}
            className="mt-2 flex items-center gap-1 text-[10.5px] font-bold text-indigo-500 active:text-indigo-700"
          >
            <Share2 className="h-3 w-3" />
            {sharedId === item.id ? 'Copied — paste it in your group ✅' : 'Challenge your friends — see how many can solve it'}
          </button>
        )}
      </div>
    );
  };

  // The winner's showcase: gold, above the ballot, no thumbs. The attribution
  // line is always true (every item is a student's); we never claim "voted to
  // the top" because on quiet days the queue promotes without votes.
  const topBlock = (item: TopPickItem | null, kindLabel: string) => {
    if (!item) return null;
    return (
      <div key={`top-${item.id}`} className="rounded-xl border border-l-4 border-amber-200 border-l-amber-500 bg-gradient-to-br from-amber-50 to-white p-3">
        <div className="flex items-center gap-1.5">
          <span className="inline-block rounded-full bg-amber-500 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-white">
            🏆 Today&apos;s Top Pick
          </span>
          <span className="text-[10px] font-bold text-amber-700">{kindLabel}{item.topic ? ` · ${item.topic}` : ''}</span>
        </div>
        {item.text && (
          <p className="mt-1.5 whitespace-pre-line text-[13px] font-medium leading-snug text-stone-900">{item.text}</p>
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
          <img src={item.imageUrl} alt="Today's top pick" className="mt-1.5 max-h-60 w-full rounded-lg border border-amber-100 object-contain" />
        )}
        <div className="mt-1 flex items-center">
          <p className="text-[10px] text-stone-400">— {item.displayName}, CareerRai student · a new pick every day</p>
          <ReportItem submissionId={item.id} />
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {topBlock(topPick?.question ?? null, '📷 Question of the day')}
      {topBlock(topPick?.tip ?? null, '💡 Tip of the day')}
      {/* Progress up top — four small decisions, and it shows you're moving. */}
      {!allDone && (
        <p className="text-[10.5px] font-bold text-stone-400">
          {done}/{all.length} judged today
        </p>
      )}
      {allDone && (
        <div className="rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 px-3.5 py-3 text-white">
          <p className="text-[13px] font-extrabold">All judged for today 🎉</p>
          <p className="mt-0.5 text-[11px] text-white/80">
            Your votes shape tomorrow&apos;s picks. New tip &amp; questions at 8 AM.
          </p>
        </div>
      )}
      {block(tip, '💡 Student Tip', 'tip')}
      {questions.map((q) => block(q, '📷 Student Question', q.section ?? 'QA'))}
    </div>
  );
}
