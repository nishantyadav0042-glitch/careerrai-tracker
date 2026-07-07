// The notification copy engine. Two live surfaces only:
//   - the Day 0-7 onboarding arc (ONBOARDING_DAYS / onboardingCopy) — real
//     habit-formation research, scheduled touchpoints while a habit forms
//   - the buddy morning brief (buddyBriefCopy)
// The generic post-day-7 guilt rotation and the growth/upgrade nudge
// variants that used to live here were retired along with the
// streak-risk and growth-nudges crons (see /api/cron/decision-engine) —
// "the notification should never sell," "delete forever" on loss-aversion
// copy. Removed rather than left unused: NO_LOG_VARIANTS,
// STREAK_RISK_VARIANTS, UPGRADE_MOCK_VARIANTS, UPGRADE_PROGRESS_VARIANTS,
// MOCK_NUDGE_VARIANTS, pickNoLogVariant, pickStreakRiskVariant,
// pickGrowthVariant, GROWTH_NUDGE_URLS, GrowthNudgeType.

/* ── First 7 days — the hardest window. A linear day-by-day arc, not a
   random pool, because this is a journey with a finish line ("habit
   locked"), not an indefinite nag. `done` fires immediately after that
   day's log; `pending` fires from the evening cron while it's still open. */

interface OnboardingCopy { title: string; body: (name: string) => string }
interface OnboardingDay { pending: OnboardingCopy; done: OnboardingCopy }

export const ONBOARDING_DAYS: Record<number, OnboardingDay> = {
  1: {
    pending: { title: 'Pehla kadam abhi baaki hai 🚀', body: (n) => `${n}, sirf 90 seconds. Aaj ka pehla log — shuruaat yahin se hoti hai.` },
    done: { title: 'Day 1 done! 🎉', body: (n) => `Shuruaat ho gayi, ${n}. 6 din aur — habit yahin se banti hai.` },
  },
  2: {
    pending: { title: 'Kal shuru kiya tha, aaj bhi? 💪', body: (n) => `${n}, Day 2 ka log abhi baaki hai. Do din lagatar — chalo karte hain.` },
    done: { title: 'Day 2 ✅ — 2 din lagatar!', body: (n) => `Pattern bann raha hai, ${n}. Kal Day 3 — mat rukna.` },
  },
  3: {
    pending: { title: 'Day 3 ka log baaki hai', body: (n) => `${n}, teesra din — yahi wo point hai jahan log rukte hain. Tum mat rukna.` },
    done: { title: 'Day 3 — halfway to habit 🔥', body: (n) => `3 din ho gaye, ${n}. Ab aadat banna shuru ho rahi hai.` },
  },
  4: {
    pending: { title: 'Day 4 — peeche mat hato', body: (n) => `${n}, 3 din ki mehnat hai. Aaj ka log karo, chain mat todo.` },
    done: { title: 'Day 4 ✅', body: (n) => `4/7, ${n}. Teen din aur — habit lock hone waali hai.` },
  },
  5: {
    pending: { title: 'Day 5 — bas 2 din aur', body: (n) => `${n}, itna aage aake rukna? Aaj ka log 90 seconds ka hai.` },
    done: { title: 'Day 5 — 2 din baaki 🎯', body: (n) => `${n}, itni consistency rare hai. Weekend mein bhi mat rukna.` },
  },
  6: {
    pending: { title: 'Day 6 — kal last din hai', body: (n) => `${n}, kal 7 poore honge. Aaj mat chhodo, itna paas hoke.` },
    done: { title: 'Day 6 — kal 7 poore! 🔥', body: (n) => `${n}, ek din aur — pura hafta complete karoge.` },
  },
  7: {
    pending: { title: 'Aaj 7th din — habit lock din', body: (n) => `${n}, poora hafta ban sakta hai aaj. Bas ek log — mat chuko.` },
    done: { title: '7/7 — HABIT LOCKED 🔒🎉', body: (n) => `${n}, ek hafta lagatar. Ab yeh routine hai, task nahi. Proud of you.` },
  },
};

export function onboardingCopy(dayNumber: number, phase: 'pending' | 'done', name: string): { title: string; body: string } | null {
  const day = ONBOARDING_DAYS[dayNumber];
  if (!day) return null;
  const c = day[phase];
  return { title: c.title, body: c.body(name) };
}

/* ── 09:00 IST — buddy morning brief (professional, no emoji, only if actionable) */

export function buddyBriefCopy(loggedYesterday: number, total: number, atRiskNames: string[]): { title: string; body: string } {
  const title = `Morning brief: ${loggedYesterday}/${total} logged yesterday`;
  const body = atRiskNames.length > 0
    ? `${atRiskNames.slice(0, 2).join(' & ')} ${atRiskNames.length === 1 ? 'has' : 'have'} gone quiet — a 2-line nudge today saves the streak.`
    : 'All students on track. A quick check-in keeps it that way.';
  return { title, body };
}
