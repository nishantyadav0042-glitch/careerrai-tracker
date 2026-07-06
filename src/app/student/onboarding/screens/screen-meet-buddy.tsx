'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface ScreenMeetBuddyProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

interface RealBuddy {
  full_name: string;
  college: string | null;
  cat_percentile: number | null;
  buddy_bio: string | null;
}

// Honest by construction: buddy assignment happens later (an admin match,
// not an automatic onboarding step), so almost every student reaches this
// screen with no buddy_id yet. This used to fabricate a generic "IIM Alumni
// Buddy" persona and a "coming soon" audio player nobody had ever recorded
// (0 of 5 real buddies have ever set intro_audio_url) — exactly the wrong
// screen to feel synthetic on. Now: show the real buddy if one is already
// assigned, otherwise say plainly that matching happens next.
export default function ScreenMeetBuddy({ onNext, onBack, canGoBack, isLoading }: ScreenMeetBuddyProps) {
  const supabase = createClient();
  const [buddy, setBuddy] = useState<RealBuddy | null | undefined>(undefined); // undefined = loading, null = none assigned

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setBuddy(null); return; }
      const { data: profile } = await supabase.from('profiles').select('buddy_id').eq('id', user.id).single();
      if (!profile?.buddy_id) { setBuddy(null); return; }
      const { data: buddyData } = await supabase
        .from('profiles')
        .select('full_name, college, cat_percentile, buddy_bio')
        .eq('id', profile.buddy_id)
        .single();
      setBuddy((buddyData as RealBuddy) ?? null);
    })();
  }, [supabase]);

  if (buddy === undefined) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Checking your buddy status…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Not coaching. 1-on-1.</p>
        <p className="text-xs text-stone-500 mt-1">One IIM senior, matched to you — not a batch.</p>
      </div>

      {buddy ? (
        <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl p-6 border border-orange-100">
          <div className="flex flex-col items-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-orange-500 to-orange-600 rounded-full flex items-center justify-center text-white text-2xl font-bold mb-3">
              {buddy.full_name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()}
            </div>
            <h3 className="text-xl font-bold text-stone-900">{buddy.full_name}</h3>
            <div className="flex gap-2 mt-3 flex-wrap justify-center">
              {buddy.college && (
                <div className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-xs font-medium">{buddy.college}</div>
              )}
              {buddy.cat_percentile != null && (
                <div className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">{buddy.cat_percentile.toFixed(1)}%ile CAT</div>
              )}
            </div>
          </div>
          {buddy.buddy_bio && (
            <p className="text-sm text-stone-700 text-center italic border-t border-orange-100 pt-4">&quot;{buddy.buddy_bio}&quot;</p>
          )}
        </div>
      ) : (
        <div className="bg-gradient-to-br from-orange-50 to-white rounded-2xl p-6 border border-orange-100 text-center space-y-2">
          <p className="text-sm font-semibold text-stone-900">You&apos;ll be matched with your buddy right after this.</p>
          <p className="text-xs text-stone-600 leading-relaxed">
            An IIM senior who scored in the top percentiles on CAT — reviews your progress every week, decodes your mocks,
            and gives you guidance built around your actual Blueprint. Not a generic batch coach.
          </p>
        </div>
      )}

      <div className="flex gap-3">
        {canGoBack && (
          <button onClick={onBack} type="button" className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
            Back
          </button>
        )}
        <button
          onClick={() => onNext()}
          disabled={isLoading}
          type="button"
          className="flex-1 py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all disabled:opacity-50 active:scale-[0.98]"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
