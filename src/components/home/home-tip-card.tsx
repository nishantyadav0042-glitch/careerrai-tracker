'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ThumbsUp, ThumbsDown, ChevronRight } from 'lucide-react';
import { track } from '@/lib/journey';

// Home's ONE community surface, sized like a whisper (founder, 25 Jul: "only
// tip in homepage, very small and cute banner"). Two short lines, inline
// thumbs, and a tiny pointer to the Daily Pick tab where questions from all
// three sections are judged. Questions never render here.

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
    <div className="rounded-xl border border-amber-200/70 bg-gradient-to-r from-amber-50 to-orange-50 px-3 py-2.5">
      {tip && (
        <div className="flex items-start gap-2">
          <span className="mt-0.5 text-[14px]">💡</span>
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-medium leading-snug text-stone-800">
              &ldquo;{tip.text}&rdquo;
            </p>
            <p className="mt-0.5 text-[10px] text-stone-400">
              — {tip.displayName} · student tip{tip.topic ? ` · ${tip.topic}` : ''}
            </p>
          </div>
          {voted ? (
            <span className="mt-0.5 shrink-0 text-[10px] font-bold text-emerald-700">Counted 🙌</span>
          ) : (
            <span className="flex shrink-0 gap-1">
              <button
                type="button" disabled={busy} onClick={() => void vote(true)}
                aria-label="Helpful"
                className="grid h-7 w-8 place-items-center rounded-lg bg-white/80 text-stone-700 shadow-sm active:scale-95 disabled:opacity-50"
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button" disabled={busy} onClick={() => void vote(false)}
                aria-label="Not helpful"
                className="grid h-7 w-8 place-items-center rounded-lg bg-white/50 text-stone-400 active:scale-95 disabled:opacity-50"
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
            </span>
          )}
        </div>
      )}
      {hasQuestions && (
        <Link
          href="/student/community"
          className={`flex items-center gap-1 text-[11px] font-bold text-indigo-600 ${tip ? 'mt-1.5 pl-6' : ''}`}
        >
          📷 Help us pick the best questions <ChevronRight className="h-3 w-3" />
        </Link>
      )}
    </div>
  );
}
