'use client';

import { useEffect, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { track } from '@/lib/journey';
import { CommunityVoteCard } from '@/components/community-vote-card';
import { CommunitySubmit } from '@/components/community-submit';

// The Daily Pick tab — the community's one home (founder, 25 Jul: bottom nav
// = Home · My Buddy · Tip/Question of the day · More).
//
// Still not a feed: the page holds today's two items to judge, the share
// entry point, and nothing that scrolls forever. When the featured rotation
// (phase 2) goes live, the day's winning tip + question render here too.
export default function CommunityPage() {
  const [share, setShare] = useState(false);

  // THE metric for this feature (founder, 25 Jul): open rate, vote-completion
  // and day-over-day return are all derived from this one event. Below 25%
  // weekly open rate, the feature gets killed, not polished.
  useEffect(() => { track('daily_pick_open', {}); }, []);

  return (
    <div className="mx-auto max-w-md space-y-3 pb-4">
      {/* Compact hero — small type, warm colour. The page must feel like a
          place students MADE, not a grey admin list (founder, 26 Jul). */}
      <div className="rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 px-4 py-3 text-white">
        <h1 className="text-[17px] font-extrabold leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Daily Pick 🤝
        </h1>
        <p className="mt-0.5 text-[11px] leading-snug text-white/80">
          One small thing from a fellow CAT aspirant, every day.
          <span className="font-bold text-white"> You decide what helps — by the students, for the students.</span>
        </p>
      </div>

      <CommunityVoteCard />

      <button
        type="button" onClick={() => setShare(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 py-3 text-[13px] font-extrabold text-white shadow-sm active:scale-[0.99]"
      >
        <HeartHandshake className="h-4 w-4" />
        Help the next student — share a tip or question
      </button>
      <p className="text-center text-[10px] text-stone-400">
        Shared anonymously · checked for safety · your votes pick what gets featured
      </p>

      {share && <CommunitySubmit onClose={() => setShare(false)} />}
    </div>
  );
}
