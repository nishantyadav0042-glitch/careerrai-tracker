'use client';

import { useEffect, useState } from 'react';
import { HeartHandshake } from 'lucide-react';
import { track } from '@/lib/journey';
import { DailySlotCard } from '@/components/daily-slot-card';
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

      {/* One thing per day, chosen by the rotation — voting is now one of
          several asks rather than the only one. 12 Aug: twelve openers, zero
          votes, on a healthy pool and a healthy route; the problem was never
          the vote button, it was that a single repeated ask cannot carry a
          daily habit. */}
      <DailySlotCard />

      {/* Share CTA is PINNED above the bottom nav (founder, 26 Jul: "scroll
          or not, it should be visible") — never buried under three questions.
          The page gets pb-32 so the last block scrolls clear of it. */}
      <div className="fixed inset-x-0 bottom-14 z-20 bg-gradient-to-t from-stone-50 via-stone-50/95 to-transparent px-3 pb-2 pt-4">
        <div className="mx-auto max-w-md">
          <button
            type="button" onClick={() => setShare(true)}
            className="w-full rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-4 py-2.5 text-left shadow-lg active:scale-[0.99]"
          >
            <span className="flex items-center gap-2 text-[13px] font-extrabold text-white">
              <HeartHandshake className="h-4 w-4 shrink-0" />
              Solved a tough question today? Share it — just a photo 📷
            </span>
            <span className="mt-0.5 block pl-6 text-[10.5px] font-medium text-white/85">
              Or a tip that worked. Be part of <span className="font-bold text-white">by the students, for the students</span>.
            </span>
          </button>
        </div>
      </div>

      {share && <CommunitySubmit onClose={() => setShare(false)} />}
    </div>
  );
}
