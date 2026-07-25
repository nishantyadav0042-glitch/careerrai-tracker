'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ThumbsUp, ThumbsDown, ChevronRight } from 'lucide-react';
import { track } from '@/lib/journey';

// Home's ONE community surface (founder, 25 Jul): today's student tip, right
// here, votable in one tap — and a single line inviting students to go filter
// questions on the Daily Pick tab. Questions never render on Home; the tip
// does, because a one-line tip is glanceable and a question is work.

interface VoteItem {
  id: string; text: string | null; topic: string | null;
  displayName: string; prompt: string;
}

export function HomeTipCard() {
  const [tip, setTip] = useState<VoteItem | null>(null);
  const [hasQuestion, setHasQuestion] = useState(false);
  const [voted, setVoted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/community/voting');
      if (res.ok) {
        const json = await res.json();
        setTip(json.tip ?? null);
        setHasQuestion(json.question != null);
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

  if (!loaded || (!tip && !hasQuestion)) return null;

  return (
    <div className="rounded-2xl border border-stone-200 bg-white p-4">
      {tip && (
        <>
          <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400">
            💡 Today&apos;s student tip{tip.topic ? ` · ${tip.topic}` : ''}
          </p>
          <p className="mt-1.5 text-[14px] font-medium leading-relaxed text-stone-900">
            &ldquo;{tip.text}&rdquo;
          </p>
          <p className="mt-1 text-[11px] text-stone-400">— {tip.displayName}, CareerRai student</p>

          {voted ? (
            <p className="mt-2 text-[12px] font-semibold text-emerald-700">
              Counted. That helps the next student.
            </p>
          ) : (
            <div className="mt-2.5 flex items-center gap-2">
              <p className="min-w-0 flex-1 text-[12px] font-semibold text-stone-600">{tip.prompt}</p>
              <button
                type="button" disabled={busy} onClick={() => void vote(true)}
                aria-label="Yes, helpful"
                className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-stone-900 text-white active:scale-[0.96] disabled:opacity-50"
              >
                <ThumbsUp className="h-4 w-4" />
              </button>
              <button
                type="button" disabled={busy} onClick={() => void vote(false)}
                aria-label="No, not helpful"
                className="grid h-9 w-12 shrink-0 place-items-center rounded-lg bg-stone-100 text-stone-500 active:scale-[0.96] disabled:opacity-50"
              >
                <ThumbsDown className="h-4 w-4" />
              </button>
            </div>
          )}
        </>
      )}

      {/* Questions live on the Daily Pick tab only — Home just points there. */}
      {hasQuestion && (
        <Link
          href="/student/community"
          className={`flex items-center gap-1.5 text-[12px] font-bold text-indigo-600 ${tip ? 'mt-3 border-t border-stone-100 pt-2.5' : ''}`}
        >
          📷 Help us pick the best questions <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}
