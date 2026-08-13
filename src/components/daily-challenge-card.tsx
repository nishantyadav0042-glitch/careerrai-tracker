'use client';

import { useCallback, useEffect, useState } from 'react';
import { Check, X, Users, HeartHandshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/journey';
import { shareChallenge } from '@/lib/share-challenge';
import { reactionLine } from '@/lib/challenge-reaction';
import { CommunitySubmit } from '@/components/community-submit';
import { TARGET_SECONDS, type ChallengeView } from '@/lib/challenge';

// Today's Proof — one question per section, same for every student, live
// from 8am. What makes ours different from every other daily question in CAT
// prep: answering writes real evidence into your topic record. Their question
// evaporates; ours compounds.
//
// Statuses shown in plain words: the verdict line tells the student where
// this topic sits in THEIR plan, which is the integration no competitor has.
// A byline is EARNED by a student. A contributed question carries their real
// name; ours carries its section and topic and nothing else. We never sign our
// own content as if a student wrote it (founder, 13 Aug: "don't mention the
// name of CareerRai under questions — if a student submits then only their
// name should be there, otherwise just mention the topic and Section").
function byline(c: ChallengeView): string {
  const base = `${c.section} · ${c.topic}`;
  return c.contributorName ? `${base} · by ${c.contributorName}` : base;
}

const STATUS_LINE: Record<string, string> = {
  not_started: "a topic you haven't started yet",
  learning: "a topic you're learning",
  practicing: "a topic you're practising",
  revising: "a topic you're revising",
  exam_ready: 'a topic you earned Exam Ready on',
};

export function DailyChallengeCard() {
  const router = useRouter();
  const [challenges, setChallenges] = useState<ChallengeView[] | null>(null);
  const [open, setOpen] = useState<ChallengeView | null>(null);
  const [share, setShare] = useState(false);
  // Answered THIS visit, before the refetch lands — so "which question is
  // next?" never re-offers the one just solved.
  const [justAnswered, setJustAnswered] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/challenge/today');
      if (!res.ok) return;
      const json = await res.json();
      setChallenges((json.challenges as ChallengeView[]) ?? []);
    } catch { /* render nothing rather than a broken card */ }
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  // No challenge scheduled today — the card vanishes entirely. An empty
  // challenge card would advertise emptiness.
  if (!challenges || challenges.length === 0) return null;

  const done = challenges.filter((c) => c.attempt != null).length;
  const allDone = done === challenges.length;

  return (
    <>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        {/* ── The loud line, on the card itself ────────────────────────────
            Founder, 13 Aug: "on top should be one line loud — Daily Pick, BY
            THE STUDENTS, FOR THE STUDENTS — very loudly, so students notice."
            It went into the question sheet first, which is exactly the place a
            student cannot see until they have already opened a question. This
            card is what is on screen, so it carries the line, on every surface
            the card appears on. */}
        <div className="bg-stone-900 px-4 py-2.5 text-white">
          <p className="text-[15px] font-black uppercase leading-none tracking-[0.14em]">Daily Pick</p>
          <p className="mt-1 text-[10.5px] font-black uppercase leading-none tracking-[0.09em] text-orange-400">
            By the students, for the students
          </p>
          {/* The strength, said as what the feature REPLACES (founder, 13
              Aug: tell them CareerRai saved them the hour). Finding one
              genuinely hard, exam-level question means an hour of Telegram
              and YouTube; here it is waiting at 8 AM. A claim about the
              product's mechanism — never a fabricated personal stat. */}
          <p className="mt-1.5 text-[11px] font-semibold leading-snug text-stone-300">
            The hour you&apos;d spend hunting a good question — saved. Just solve.
          </p>
        </div>

        <div className="p-4">
          {allDone ? (
            /* ── The finished state is the payoff, not a locked door ────────
               It used to be one grey sentence saying come back at 8 AM: the
               student had just solved a timed CAT question and the screen
               said nothing about it. The clock's result is the whole reason
               the clock exists, so it is reported here, and it stays readable
               all day. */
            <div className="space-y-2">
              {challenges.map((c) => (
                <button
                  key={c.id} type="button"
                  onClick={() => { setOpen(c); track('challenge_opened', { section: c.section, answered: true }); }}
                  className="flex w-full items-center gap-2.5 rounded-xl bg-stone-50 px-3 py-2.5 text-left active:scale-[0.99]"
                >
                  <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full ${c.attempt?.isCorrect ? 'bg-emerald-600' : 'bg-rose-500'}`}>
                    {c.attempt?.isCorrect ? <Check className="h-4 w-4 text-white" /> : <X className="h-4 w-4 text-white" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-stone-900">
                      {c.attempt?.isCorrect ? 'Got it' : 'Missed it'}
                      {c.attempt?.yourSeconds != null && (
                        <span className={c.attempt.beatTheClock ? 'text-emerald-700' : 'text-stone-500'}>
                          {' '}· {c.attempt.yourSeconds}s{c.attempt.beatTheClock ? ' ⚡' : ''}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[11px] text-stone-500">
                      {byline(c)}
                      {c.attempt?.inTimePct != null && ` · ${c.attempt.inTimePct}% finished in time`}
                    </span>
                  </span>
                  <span className="shrink-0 text-[11px] font-bold text-orange-600">See why</span>
                </button>
              ))}
              <p className="pt-0.5 text-center text-[11px] text-stone-400">
                Next one at 8&nbsp;AM tomorrow.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {/* The deal, stated BEFORE they open it. A timer nobody was told
                  about is a trap; a timer announced up front is the reason
                  they stop scrolling and start solving. Each row wears its OWN
                  clock — a VARC summary races 60s, a QA grind gets its 90. */}
              <p className="text-[12px] font-bold text-stone-900">
                Beat the clock.
                <span className="ml-1 font-medium text-stone-500">It starts the moment you open a question.</span>
              </p>
              {challenges.map((c) => (
                <button
                  key={c.id} type="button"
                  onClick={() => { setOpen(c); track('challenge_opened', { section: c.section, answered: !!c.attempt }); }}
                  className="flex w-full items-center gap-2.5 rounded-xl border border-stone-200 px-3 py-2.5 text-left active:scale-[0.99]"
                >
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-bold ${
                    c.attempt ? (c.attempt.isCorrect ? 'bg-emerald-600 text-white' : 'bg-rose-500 text-white') : 'bg-stone-100 text-stone-600'
                  }`}>
                    {c.attempt ? (c.attempt.isCorrect ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />) : c.section.charAt(0)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-bold text-stone-900">{c.section} · {c.topic}</span>
                    {c.contributorName && (
                      <span className="block truncate text-[11px] font-semibold text-indigo-600">
                        Shared by {c.contributorName}
                      </span>
                    )}
                  </span>
                  {!c.attempt && (
                    <span className="shrink-0 rounded-md bg-orange-50 px-1.5 py-0.5 text-[11px] font-extrabold text-orange-600">
                      ⏱ {c.targetSeconds ?? TARGET_SECONDS}s
                    </span>
                  )}
                  <span className="shrink-0 text-[11px] font-bold text-orange-600">
                    {c.attempt ? 'Review' : 'Solve'}
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* Students helping students — always visible, open from day one. */}
          <button
            type="button"
            onClick={() => { setShare(true); track('community_share_opened', {}); }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 border-t border-stone-100 pt-2.5 text-[12px] font-semibold text-stone-500"
          >
            <HeartHandshake className="h-3.5 w-3.5" />
            Help the next student
          </button>
        </div>
      </div>

      {open && (
        <ChallengeModal
          /* key = the whole "smart timer" guarantee. Founder, 13 Aug: when one
             question is solved and the next comes up, ITS clock must start
             fresh. Keying the sheet by question id forces a full remount on
             advance, so startedAt, the tick interval and every piece of state
             are born new for every question — the old clock cannot leak into
             the next one. */
          key={open.id}
          challenge={open}
          next={challenges.find((c) => c.id !== open.id && !c.attempt && !justAnswered.has(c.id)) ?? null}
          onNext={(answeredId, nxt) => {
            setJustAnswered((prev) => new Set(prev).add(answeredId));
            void load();
            setOpen(nxt);
          }}
          onClose={(changed) => { setOpen(null); if (changed) { void load(); router.refresh(); } }}
        />
      )}
      {share && <CommunitySubmit onClose={() => setShare(false)} />}
    </>
  );
}

interface Verdict {
  isCorrect: boolean; correctIndex: number; explanation: string;
  communityCorrectPct: number | null; attemptCount: number;
  topic: string; coverageStatus: string;
  /** Share of timed attempts that came in under the target. Null until enough
   *  attempts exist — same density gate as the correctness split. */
  inTimePct?: number | null;
  yourSeconds?: number | null;
  targetSeconds?: number;
  beatTheClock?: boolean | null;
}

function ChallengeModal({ challenge, next, onNext, onClose }: {
  challenge: ChallengeView;
  /** The following unanswered question, if today has one — powers the
   *  solve → next → solve chain, each hop on a fresh clock. */
  next: ChallengeView | null;
  onNext: (answeredId: string, nxt: ChallengeView) => void;
  onClose: (changed: boolean) => void;
}) {
  const [picked, setPicked] = useState<number | null>(challenge.attempt?.choice ?? null);
  const [verdict, setVerdict] = useState<Verdict | null>(
    challenge.attempt
      ? { ...challenge.attempt, topic: challenge.topic }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [shareResult, setShareResult] = useState<string | null>(null);
  const [startedAt] = useState(() => Date.now());

  // ── The clock (founder, 13 Aug) ───────────────────────────────────────────
  // "Start a timer as soon as they click Daily Pick — solve this in 90 secs —
  // so they don't even think, they just read and start solving."
  //
  // It runs from the moment the card opens and freezes on answer. It NEVER
  // blocks: past 90s it keeps counting up in grey, the student still answers
  // and still learns, they just don't get the in-time badge. A hard cutoff
  // would make a daily habit into something you can fail, which is the
  // quickest way to stop it being daily.
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (verdict) return;
    const id = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(id);
  }, [verdict, startedAt]);
  // THIS question's clock — a VARC summary races 60s, a QA grind gets its 90.
  const target = challenge.targetSeconds ?? TARGET_SECONDS;
  const left = target - elapsed;
  const overtime = left < 0;

  async function submit(choice: number) {
    if (verdict || busy) return;
    setBusy(true);
    setPicked(choice);
    try {
      const res = await fetch('/api/challenge/attempt', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challenge_id: challenge.id, choice,
          /* eslint-disable-next-line react-hooks/purity -- elapsed time on an
             explicit user action (submit), not during render */
          seconds: Math.round((Date.now() - startedAt) / 1000),
        }),
      });
      const json = await res.json();
      if (res.ok) {
        track('challenge_answered', { section: challenge.section, correct: json.isCorrect });
        setVerdict(json as Verdict);
      } else {
        setPicked(null);
      }
    } catch { setPicked(null); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        {/* The loudest line on the screen (founder, 13 Aug): this feed is not
            content we publish, it is students helping students — and that is
            the whole reason to open it. */}
        <p className="mb-3 rounded-lg bg-stone-900 px-3 py-2 text-center text-[11.5px] font-extrabold uppercase tracking-wider text-white">
          Daily Pick — by the students, for the students
        </p>

        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">
              {challenge.section} · {challenge.topic}
            </p>
            {challenge.contributorName && (
              <p className="mt-0.5 text-[11px] text-stone-500">
                Shared by <span className="font-semibold text-stone-700">{challenge.contributorName}</span>
              </p>
            )}
          </div>
          {/* The clock. Counts down to the target, then keeps counting up in
              grey rather than stopping or blocking — the answer is always
              available, the badge is what's at stake. */}
          {!verdict && (
            <div className={`shrink-0 rounded-xl px-3 py-1.5 text-center ${
              overtime ? 'bg-stone-100' : left <= 15 ? 'bg-rose-50' : 'bg-indigo-50'
            }`}>
              <p className={`font-mono text-[17px] font-extrabold leading-none tabular-nums ${
                overtime ? 'text-stone-400' : left <= 15 ? 'text-rose-600' : 'text-indigo-700'
              }`}>
                {overtime ? `+${Math.abs(left)}` : left}s
              </p>
              <p className="mt-0.5 text-[8.5px] font-bold uppercase tracking-wide text-stone-400">
                {overtime ? 'over' : 'to beat'}
              </p>
            </div>
          )}
          <button type="button" onClick={() => onClose(!!verdict)} aria-label="Close" className="text-stone-400">
            <X className="h-4 w-4" />
          </button>
        </div>

        <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-stone-900">{challenge.question}</p>

        <div className="mt-4 space-y-2">
          {challenge.options.map((opt, i) => {
            const isPick = picked === i;
            const isRight = verdict != null && i === verdict.correctIndex;
            const isWrongPick = verdict != null && isPick && !isRight;
            return (
              <button
                key={i} type="button" disabled={busy || verdict != null}
                onClick={() => void submit(i)}
                className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-3 text-left text-[14px] font-medium transition-colors ${
                  isRight ? 'border-emerald-500 bg-emerald-50 text-emerald-900'
                  : isWrongPick ? 'border-rose-400 bg-rose-50 text-rose-900'
                  : isPick ? 'border-stone-900 bg-stone-50 text-stone-900'
                  : 'border-stone-200 text-stone-800'
                }`}
              >
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-stone-100 text-[11px] font-bold text-stone-600">
                  {String.fromCharCode(65 + i)}
                </span>
                {opt}
                {isRight && <Check className="ml-auto h-4 w-4 shrink-0 text-emerald-600" />}
                {isWrongPick && <X className="ml-auto h-4 w-4 shrink-0 text-rose-500" />}
              </button>
            );
          })}
        </div>

        {verdict && (
          <div className="mt-4 space-y-3">
            <p className={`text-[15px] font-bold ${verdict.isCorrect ? 'text-emerald-700' : 'text-rose-600'}`}>
              {verdict.isCorrect ? 'Correct.' : 'Not this time.'}
            </p>

            {/* The beat before the teaching. Founder, 13 Aug: the question is
                content, the reveal is entertainment — a student handed algebra
                the instant they answer feels corrected; one who first reads
                "you're in very good company" feels let in on something. */}
            <p className="text-[13.5px] font-semibold text-stone-600">
              {reactionLine(verdict.isCorrect, challenge.id)}
            </p>

            {/* The community moment — shown ONLY when the number is real.
                The fallback used to read "you're one of the first {N} to
                attempt today's question", which rendered as "one of the first
                2" and told the student exactly how empty the room was — the
                precise thing the no-small-numbers rule exists to prevent.
                Being early is still a nice status; it just does not need a
                count attached to it. */}
            {/* When there is no real community number yet, say NOTHING.
                Founder, 13 Aug: "why are you mentioning you are among the
                first… it's unnecessary." He is right — it is a consolation
                line dressed as a stat. It tells the student nothing about
                their answer, and on a quiet day it quietly advertises that
                the room is empty. Silence reads as normal; a filler line
                reads as an excuse. */}
            {/* The clock's payoff. Their own time always shows — it is their
                own data and needs no density gate. The comparison only appears
                once enough students have been timed, same rule as the
                correctness split: a percentage over three people reports how
                few of us there are, not how hard the question was. */}
            {verdict.yourSeconds != null && (
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 rounded-xl bg-stone-50 px-3 py-2">
                <span className={`text-[12.5px] font-extrabold ${verdict.beatTheClock ? 'text-emerald-700' : 'text-stone-600'}`}>
                  {verdict.beatTheClock ? `Beat the clock — ${verdict.yourSeconds}s` : `${verdict.yourSeconds}s`}
                </span>
                {verdict.inTimePct != null && (
                  <span className="text-[11.5px] text-stone-500">
                    {verdict.inTimePct}% finished in time
                  </span>
                )}
              </div>
            )}

            {verdict.communityCorrectPct != null && (
              <p className="flex items-center gap-1.5 text-[12px] text-stone-500">
                <Users className="h-3.5 w-3.5" />
                {verdict.communityCorrectPct}% of {verdict.attemptCount} students got this right
              </p>
            )}

            <p className="rounded-xl bg-stone-50 p-3 text-[13px] leading-relaxed text-stone-700">
              {verdict.explanation}
            </p>

            {/* The integration beat — what no other daily question does. */}
            <p className="rounded-xl bg-indigo-50 px-3 py-2 text-[12px] leading-relaxed text-indigo-800">
              This was <span className="font-bold">{verdict.topic}</span> — {STATUS_LINE[verdict.coverageStatus] ?? 'in your syllabus'}.
              Your answer just counted toward its evidence.
            </p>

            {/* Post-solve is the peak moment to forward it — they just felt
                something (nailed it or got burned) and the group should too.
                Founder, 13 Aug: the 90 seconds IS the push to share — "will
                your friends also solve it in 90 secs?" So the button is the
                dare, personalised with their own time when we have it, and
                the forwarded text opens with the same dare. */}
            <button
              type="button"
              onClick={() => void shareChallenge(
                {
                  section: challenge.section, topic: challenge.topic,
                  text: challenge.question, options: challenge.options,
                  yourSeconds: verdict.yourSeconds ?? null,
                  targetSeconds: target,
                },
                'daily_proof',
              ).then((r) => setShareResult(r))}
              className="w-full rounded-xl border-2 border-orange-300 bg-orange-50 py-2.5 text-[13px] font-bold text-orange-700 active:scale-[0.99]"
            >
              {shareResult === 'copied'
                ? 'Copied — paste it in your group'
                : verdict.yourSeconds != null && verdict.beatTheClock
                  ? `📤 You did it in ${verdict.yourSeconds}s — dare your friends to beat that`
                  : `📤 Can your friends crack it in ${target} secs? Share it`}
            </button>
            {/* The chain. One question rarely costs the full 90 seconds a
                student showed up with — so the moment this one is settled,
                the next unsolved one is a single tap away, on its OWN fresh
                clock (the parent remounts the sheet per question). Always a
                choice, never an auto-advance: yanking the screen away while
                someone is reading the explanation would teach them not to
                read it. */}
            {next ? (
              <div className="flex gap-2">
                <button
                  type="button" onClick={() => onClose(true)}
                  className="rounded-xl border border-stone-300 px-4 py-3 text-[14px] font-bold text-stone-600"
                >
                  Done
                </button>
                <button
                  type="button" onClick={() => onNext(challenge.id, next)}
                  className="flex-1 rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white active:scale-[0.99]"
                >
                  Next question · {next.section} →
                </button>
              </div>
            ) : (
              <button
                type="button" onClick={() => onClose(true)}
                className="w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white"
              >
                Done
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
