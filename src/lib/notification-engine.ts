// The notification copy engine — every push the app sends, in one file.
// Voice: elder sibling (bhaiya/didi), Hinglish — English for exam vocabulary
// (mock, streak, log, percentile), Hindi for emotion and urgency. Zomato-style:
// short, personal, a little cheeky, never robotic. Titles < 40 chars,
// bodies < 90 chars. Light emoji for students; none for buddies.
//
// Single goal of every push: the student OPENS THE APP. Each variant deep-links
// to the one screen where the sub-goal (log / upgrade / puzzle / buddy) happens.
// Edit lines freely — logic never lives here.

interface Variant {
  title: string;
  body: (ctx: CopyContext) => string;
}

export interface CopyContext {
  name: string;            // first name
  streak: number;          // current streak (0 if none)
  dreamCollege: string | null;
  buddyName?: string | null;
}

/* ── 20:00 IST — daily log reminder (rotates; never the same nag twice) ────── */

const NO_LOG_VARIANTS: Variant[] = [
  {
    title: 'Aaj ka log pending hai 📝',
    body: ({ name }) => `${name}, 90 seconds. Bas itna lagta hai. Din waste mat hone do.`,
  },
  {
    title: 'Padha toh log bhi karo ✍️',
    body: ({ name }) => `Jo track nahi hota, wo improve nahi hota. ${name}, aaj ka log abhi.`,
  },
  {
    title: 'Streak bol rahi hai: aaj bhi? 🔥',
    body: ({ name, streak }) =>
      streak > 0
        ? `${streak} din se consistent ho, ${name}. Day ${streak + 1} sirf ek log door hai.`
        : `${name}, pehla log hi sabse important hota hai. Aaj se shuru?`,
  },
  {
    title: 'Dream college yaad hai na? 🎯',
    body: ({ dreamCollege }) =>
      dreamCollege
        ? `${dreamCollege} khud nahi aayega. Aaj ka log = ek din aur closer.`
        : 'CAT paas nahi aata, tum paas jaate ho. Aaj ka log karo.',
  },
  {
    title: '2 min ka break? Puzzle try karo 🧩',
    body: ({ name }) => `${name}, aaj ka LRDI puzzle solve karo — aur haan, log bhi pending hai.`,
  },
  {
    title: 'Aaj ka din gaya kahan? 👀',
    body: ({ name }) => `${name}, padha ya nahi — dono cases mein log karo. Sach hi likhna.`,
  },
];

/* ── 21:30 IST — streak about to break (only when streak >= 2) ─────────────── */

const STREAK_RISK_VARIANTS: Variant[] = [
  {
    title: 'Streak TOOT jayegi 💔',
    body: ({ name, streak }) => `${streak} din ki mehnat, ${name}. 90 seconds mein bacha lo — abhi.`,
  },
  {
    title: 'Aakhri mauka — 🔥 bachao',
    body: ({ streak }) => `${streak}-day streak midnight pe reset ho jayegi. Log karo, so jao.`,
  },
  {
    title: 'Itna aage aake rukna? 🥺',
    body: ({ name, streak }) => `${name}, ${streak} din consistent the. Aaj miss kiya toh zero se shuru.`,
  },
];

/* ── 13:00 IST — growth nudges (students past their first 7 days, max ONE/day) */

const UPGRADE_MOCK_VARIANTS: Variant[] = [
  {
    title: 'Mock diya. Decode kaun karega? 🔍',
    body: () => 'Score dikh gaya, gaps nahi. Ek IIM senior se mock debrief karwao.',
  },
  {
    title: 'Weak section khud nahi sudhrega',
    body: ({ name }) => `${name}, tumhare mocks mein pattern hai. Buddy use ek call mein pakad legi.`,
  },
];

const UPGRADE_PROGRESS_VARIANTS: Variant[] = [
  {
    title: 'Consistent ho. Ab next level? 📈',
    body: ({ streak }) => `${streak > 0 ? `${streak}-day streak` : 'Regular logs'} + ek IIM senior daily dekhe = alag hi speed.`,
  },
  {
    title: 'Solo prep vs guided prep',
    body: ({ name }) => `${name}, jo tum akele 3 mahine mein seekhoge, buddy 3 hafte mein dikha degi.`,
  },
];

const MOCK_NUDGE_VARIANTS: Variant[] = [
  {
    title: '7 din, zero mocks 👀',
    body: ({ name }) => `${name}, CAT mocks se crack hota hai, padhai se nahi. Is weekend ek mock pakka?`,
  },
  {
    title: 'Mock se darr lag raha hai? 😅',
    body: () => 'Kam score bhi data hai. Ek mock do, log karo — improvement wahi se shuru hoti hai.',
  },
];

/* ── First 7 days — the hardest window. A linear day-by-day arc, not a random
   pool, because this is a journey with a finish line ("habit locked"), not an
   indefinite nag. Two touches/day max while onboarding: a morning nudge and an
   evening one (replacing the generic reminder) — then the normal system takes
   over once day 7 is reached. `done` fires immediately after that day's log;
   `pending` fires from the morning/evening crons while it's still open. ────── */

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

/* ── picker: rotate variants, avoiding recently used titles ─────────────────── */

function pick(variants: Variant[], ctx: CopyContext, recentTitles: string[]): { title: string; body: string } {
  const recent = new Set(recentTitles);
  const fresh = variants.filter((v) => !recent.has(v.title));
  const pool = fresh.length > 0 ? fresh : variants;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return { title: chosen.title, body: chosen.body(ctx) };
}

export function pickNoLogVariant(
  name: string,
  dreamCollege: string | null,
  streak: number,
  recentTitles: string[]
): { title: string; body: string } {
  return pick(NO_LOG_VARIANTS, { name, dreamCollege, streak }, recentTitles);
}

export function pickStreakRiskVariant(ctx: CopyContext, recentTitles: string[]) {
  return pick(STREAK_RISK_VARIANTS, ctx, recentTitles);
}

export type GrowthNudgeType = 'upgrade_mock' | 'upgrade_progress' | 'mock_nudge';

const GROWTH_VARIANTS: Record<GrowthNudgeType, Variant[]> = {
  upgrade_mock: UPGRADE_MOCK_VARIANTS,
  upgrade_progress: UPGRADE_PROGRESS_VARIANTS,
  mock_nudge: MOCK_NUDGE_VARIANTS,
};

// Where each nudge should land the student (the sub-goal screen).
export const GROWTH_NUDGE_URLS: Record<GrowthNudgeType, string> = {
  upgrade_mock: '/student/profile',     // recommended-buddies showcase lives here
  upgrade_progress: '/student/profile',
  mock_nudge: '/student/exams',
};

export function pickGrowthVariant(type: GrowthNudgeType, ctx: CopyContext, recentTitles: string[]) {
  return pick(GROWTH_VARIANTS[type], ctx, recentTitles);
}
