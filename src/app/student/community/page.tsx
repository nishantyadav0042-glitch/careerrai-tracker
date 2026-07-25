'use client';

import { useState } from 'react';
import { HeartHandshake } from 'lucide-react';
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

  return (
    <div className="mx-auto max-w-md space-y-3 pb-4">
      <div>
        <h1 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Daily Pick
        </h1>
        <p className="mt-0.5 text-[13px] text-stone-500">
          By the students, for the students. One tip, one question a day —
          your vote decides what gets featured.
        </p>
      </div>

      <CommunityVoteCard />

      <button
        type="button" onClick={() => setShare(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-stone-300 bg-white py-3.5 text-[13px] font-bold text-stone-600 active:scale-[0.99]"
      >
        <HeartHandshake className="h-4 w-4" />
        Help the next student — share a tip or question
      </button>
      <p className="text-center text-[11px] text-stone-400">
        Shared anonymously · checked for safety · students vote on what gets featured
      </p>

      {share && <CommunitySubmit onClose={() => setShare(false)} />}
    </div>
  );
}
