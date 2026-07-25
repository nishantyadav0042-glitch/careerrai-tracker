'use client';

import { useCallback, useEffect, useState } from 'react';
import { Swords, Check, X, Users, HeartHandshake } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { track } from '@/lib/journey';
import { CommunitySubmit } from '@/components/community-submit';
import type { ChallengeView } from '@/lib/challenge';

// Today's Proof — one question per section, same for every student, live
// from 8am. What makes ours different from every other daily question in CAT
// prep: answering writes real evidence into your topic record. Their question
// evaporates; ours compounds.
//
// Statuses shown in plain words: the verdict line tells the student where
// this topic sits in THEIR plan, which is the integration no competitor has.
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
      <div className="rounded-2xl border border-stone-200 bg-white p-4">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-indigo-600">
            <Swords className="h-4 w-4 text-white" />
          </span>
          {/* "Proof", not "Challenge" — every prep app has a Daily Quiz; the
              name must say what makes ours different: this is measurement.
              You are not playing, you are adding a row to your evidence. */}
          <h2 className="text-sm font-bold text-stone-900">Today&apos;s Proof</h2>
          <span className="ml-auto text-[11px] font-bold text-stone-400">{done}/{challenges.length}</span>
        </div>

        {allDone ? (
          <p className="mt-2 text-[13px] text-stone-600">
            Proof logged for today — tomorrow&apos;s at 8&nbsp;AM.
          </p>
        ) : (
          <div className="mt-3 space-y-2">
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
                    <span className="block truncate text-[11px] text-indigo-600">
                      Shared by {c.contributorName}
                    </span>
                  )}
                </span>
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

      {open && (
        <ChallengeModal
          challenge={open}
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
}

function ChallengeModal({ challenge, onClose }: { challenge: ChallengeView; onClose: (changed: boolean) => void }) {
  const [picked, setPicked] = useState<number | null>(challenge.attempt?.choice ?? null);
  const [verdict, setVerdict] = useState<Verdict | null>(
    challenge.attempt
      ? { ...challenge.attempt, topic: challenge.topic }
      : null,
  );
  const [busy, setBusy] = useState(false);
  const [startedAt] = useState(() => Date.now());

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
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-indigo-600">
              {challenge.section} · {challenge.topic}
            </p>
            {challenge.contributorName && (
              <p className="mt-0.5 text-[11px] text-stone-500">
                Shared by <span className="font-semibold text-stone-700">{challenge.contributorName}</span> — a CareerRai student
              </p>
            )}
          </div>
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

            {/* The community moment — shown only when the number is real. */}
            {verdict.communityCorrectPct != null ? (
              <p className="flex items-center gap-1.5 text-[12px] text-stone-500">
                <Users className="h-3.5 w-3.5" />
                {verdict.communityCorrectPct}% of {verdict.attemptCount} students got this right
              </p>
            ) : (
              <p className="flex items-center gap-1.5 text-[12px] text-stone-500">
                <Users className="h-3.5 w-3.5" />
                You&apos;re one of the first {verdict.attemptCount} to attempt today&apos;s question
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

            <button
              type="button" onClick={() => onClose(true)}
              className="w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white"
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
