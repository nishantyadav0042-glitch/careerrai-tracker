'use client';

import { useEffect, useState } from 'react';
import { Star } from 'lucide-react';
import { track } from '@/lib/journey';
import type { RatingPromptTrigger } from '@/lib/rating-prompt';

// The in-app "rate us" ask (founder reminder, 11 Aug). Self-contained: mount
// it at a happy moment and it decides for itself, server-side, whether this
// student is actually eligible (see /api/rating-prompt/show — cross-device
// cooldown, lifetime cap, permanent suppression after a rate or a "don't ask
// again"). Renders nothing while checking and nothing if ineligible, so it is
// always safe to mount unconditionally at a trigger site.
const COPY: Record<RatingPromptTrigger, { title: string; body: string }> = {
  streak_milestone: {
    title: 'You’re on a roll',
    body: 'If CareerRai has helped you stay consistent, a quick rating helps other students find it.',
  },
  mock_completed: {
    title: 'Mock logged — nice work',
    body: 'Enjoying CareerRai? A quick rating helps other students find it.',
  },
  blueprint_reveal: {
    title: 'Your plan is ready',
    body: 'If this felt useful, a quick rating helps other students find CareerRai.',
  },
};

export function RatingPromptSheet({ trigger, onDone }: { trigger: RatingPromptTrigger; onDone?: () => void }) {
  const [state, setState] = useState<'checking' | 'hidden' | 'shown'>('checking');
  const [promptId, setPromptId] = useState<number | null>(null);
  const [storeUrl, setStoreUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/rating-prompt/show', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trigger }),
    })
      .then((r) => r.json())
      .then((data: { show: boolean; id?: number; url?: string }) => {
        if (cancelled) return;
        if (data.show && data.id && data.url) {
          setPromptId(data.id);
          setStoreUrl(data.url);
          setState('shown');
          track('rating_prompt_shown', { trigger });
        } else {
          setState('hidden');
        }
      })
      .catch(() => { if (!cancelled) setState('hidden'); });
    return () => { cancelled = true; };
  }, [trigger]);

  if (state !== 'shown') return null;

  const resolve = (action: 'rated' | 'dismissed' | 'never_ask_again') => {
    if (promptId != null) {
      fetch('/api/rating-prompt/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: promptId, action }),
      }).catch(() => { /* best-effort */ });
    }
    track(`rating_prompt_${action}`, { trigger });
    setState('hidden');
    onDone?.();
  };

  const rate = () => {
    if (storeUrl) window.location.href = storeUrl;
    resolve('rated');
  };

  const copy = COPY[trigger];

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-stone-900">
          <Star className="h-7 w-7 text-white" fill="currentColor" />
        </div>
        <h2 className="text-center text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {copy.title}
        </h2>
        <p className="mt-2 text-center text-sm text-stone-500">{copy.body}</p>

        <button
          type="button"
          onClick={rate}
          className="mt-5 w-full rounded-2xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          Rate CareerRai
        </button>
        <button
          type="button"
          onClick={() => resolve('dismissed')}
          className="mt-2 w-full rounded-2xl py-3 text-sm font-medium text-stone-500 transition-all active:scale-[0.98]"
        >
          Not now
        </button>
        <button
          type="button"
          onClick={() => resolve('never_ask_again')}
          className="mt-1 w-full text-center text-xs text-stone-400 underline-offset-2 hover:underline"
        >
          Don&apos;t ask again
        </button>
      </div>
    </div>
  );
}
