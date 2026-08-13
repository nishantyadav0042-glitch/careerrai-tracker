'use client';

import { useEffect, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { track } from '@/lib/journey';
import { DailySlotCard } from '@/components/daily-slot-card';
import { StudentInsights } from '@/components/student-insights';
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
    <div className="mx-auto max-w-md space-y-3 pb-32">
      {/* The gradient hero that used to sit here is GONE (13 Aug). It said
          "Daily Pick" and "by the students, for the students" directly above a
          card that now says both, louder — two headers stacked, the second
          contradicting the first's design. Founder: "this mix of screen should
          not exist." The card is the header now, and it is the same header on
          Home, so the surface reads identically wherever a student meets it. */}

      {/* One thing per day, chosen by the rotation — voting is now one of
          several asks rather than the only one. 12 Aug: twelve openers, zero
          votes, on a healthy pool and a healthy route; the problem was never
          the vote button, it was that a single repeated ask cannot carry a
          daily habit. */}
      <DailySlotCard />

      {/* Below the day's one curated thing: what other students have added.
          This is the community loop — browse, find something useful, vote, and
          eventually add your own. No counts anywhere on it (see
          lib/os/insight-feed.ts); rank carries the signal instead. */}
      <StudentInsights />

      {/* Share CTA is PINNED above the bottom nav (founder, 26 Jul: "scroll
          or not, it should be visible") — never buried under three questions.
          The page gets pb-32 so the last block scrolls clear of it. */}
      <div className="fixed inset-x-0 bottom-14 z-20 bg-gradient-to-t from-stone-50 via-stone-50/95 to-transparent px-3 pb-2 pt-4">
        <div className="mx-auto max-w-md">
          <button
            type="button" onClick={() => setShare(true)}
            className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-3 shadow-lg active:scale-[0.99]"
          >
            {/* One line (founder, 13 Aug: "too verbose, no one will read
                long lines — share tough question/tip you solved today,
                simple and sorted"). The second explainer line is gone. */}
            <span className="flex items-center justify-center gap-2 text-[13.5px] font-extrabold text-white">
              <HeartHandshake className="h-4 w-4 shrink-0" />
              Share a tough question / tip you solved today 📷
            </span>
          </button>
        </div>
      </div>

      {share && <CommunitySubmit onClose={() => setShare(false)} />}
    </div>
  );
}
