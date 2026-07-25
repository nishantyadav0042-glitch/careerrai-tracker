'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ThumbsUp, ThumbsDown, ChevronRight } from 'lucide-react';
import { track } from '@/lib/journey';
import { ReportItem } from '@/components/report-item';

// Home's ONE community surface. Compact — but never flat (founder, 26 Jul:
// "conceptually right, visually not appealing... nowhere have you mentioned
// WHY thumbs up or no"). The structure that makes it land:
//   label on TOP (what am I looking at) → the tip → who → THE QUESTION that
//   gives the vote meaning → Yes/No. The student is making a decision that
//   shapes what others see — the copy must say so, or the thumbs are noise.

interface VoteItem {
  id: string; text: string | null; topic: string | null;
  displayName: string; prompt: string;
}

export function HomeTipCard() {
  const [tip, setTip] = useState<VoteItem | null>(null);
  const [hasQuestions, setHasQuestions] = useState(false);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/community/voting');
      if (res.ok) {
        const json = await res.json();
        setTip(json.tip ?? null);
        setHasQuestions(((json.questions as unknown[]) ?? []).length > 0);
      }
    } catch { /* render nothing */ }
    setLoaded(true);
  }, []);

  /* eslint-disable-next-line react-hooks/set-state-in-effect -- initial fetch */
  useEffect(() => { void load(); }, [load]);

  async function vote(helpful: boolean) {
    if (!tip) return;
    setBusy(true);
    try {
      const res = await fetch('/api/community/vote', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submission_id: tip.id, helpful }),
      });
      if (res.ok || res.status === 409) {
        track('community_voted', { kind: 'tip', helpful, surface: 'home' });
        setVoted(true);
      }
    } catch { /* leave as-is */ }
    setBusy(false);
  }

  if (!loaded || (!tip && !hasQuestions)) return null;

  return (
    <div className="overflow-hidden rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 via-orange-50 to-amber-50">
      {tip && (
        <div className="px-3.5 py-3">
          {/* WHAT this is, on top — so a Para Jumbles tip never reads as
              "kya hai ye". */}
          <p className="text-[9.5px] font-extrabold uppercase tracking-widest text-amber-600">
            💡 Student Tip{tip.topic ? ` · ${tip.topic}` : ''}
          </p>

          <p className="mt-1 text-[13.5px] font-semibold leading-snug text-stone-900">
            &ldquo;{tip.text}&rdquo;
          </p>
          <div className="mt-0.5 flex items-center gap-2">
            <p className="text-[10.5px] text-stone-400">— {tip.displayName}, CareerRai student</p>
            {/* Play UGC compliance: reportable wherever it's shown. */}
            <ReportItem submissionId={tip.id} />
          </div>

          {voted ? (
            <p className="mt-2 text-[11.5px] font-bold text-emerald-700">
              🙌 Counted! You&apos;re deciding what students see next.
            </p>
          ) : (
            <>
              {/* The WHY of the thumbs — the ownership line. */}
              <p className="mt-2 text-[11.5px] font-bold text-stone-700">
                Did this tip feel useful? Your vote decides if it stays.
              </p>
              <div className="mt-1.5 flex gap-1.5">
                <button
                  type="button" disabled={busy} onClick={() => void vote(true)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-stone-900 py-1.5 text-[11.5px] font-bold text-white active:scale-[0.97] disabled:opacity-50"
                >
                  <ThumbsUp className="h-3 w-3" /> Useful
                </button>
                <button
                  type="button" disabled={busy} onClick={() => void vote(false)}
                  className="flex flex-1 items-center justify-center gap-1 rounded-lg bg-white/80 py-1.5 text-[11.5px] font-bold text-stone-500 shadow-sm active:scale-[0.97] disabled:opacity-50"
                >
                  <ThumbsDown className="h-3 w-3" /> Not really
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {hasQuestions && (
        <Link
          href="/student/community"
          className="flex items-center justify-between border-t border-amber-200/60 bg-white/50 px-3.5 py-2 text-[11.5px] font-bold text-indigo-700 active:bg-white/80"
        >
          <span>📷 Today&apos;s questions are waiting for your vote</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        </Link>
      )}
    </div>
  );
}
