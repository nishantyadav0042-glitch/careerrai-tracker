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
      {/* Header sized like a caption — the questions below need the space.
          The line that matters: WE don't pick these, students do. */}
      <div>
        <h1 className="text-lg font-bold leading-tight text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          Daily Pick
        </h1>
        <p className="mt-0.5 text-[10.5px] leading-snug text-stone-400">
          We don&apos;t decide the daily tip &amp; question — <span className="font-semibold text-stone-500">you do</span>.
          By the students, for the students.
        </p>
      </div>

      <CommunityVoteCard />

      <button
        type="button" onClick={() => setShare(true)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-stone-300 bg-white py-2.5 text-[12px] font-bold text-stone-600 active:scale-[0.99]"
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
