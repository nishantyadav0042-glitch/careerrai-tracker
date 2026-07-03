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

/* ── 13:00 IST — growth nudges (free users, max ONE per day, priority-picked) ─ */

const ACTIVATION_VARIANTS: Variant[] = [
  {
    title: 'Account bana, prep kab? 😄',
    body: ({ name }) => `${name}, pehla log 90 sec ka hai. CAT waale roz dikhte hain — aaj se?`,
  },
  {
    title: 'Ek chhota sa start? ✨',
    body: ({ name }) => `${name}, aaj sirf 1 cheez: apna pehla daily log. Baaki hum dekh lenge.`,
  },
];

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

export type GrowthNudgeType = 'activation' | 'upgrade_mock' | 'upgrade_progress' | 'mock_nudge';

const GROWTH_VARIANTS: Record<GrowthNudgeType, Variant[]> = {
  activation: ACTIVATION_VARIANTS,
  upgrade_mock: UPGRADE_MOCK_VARIANTS,
  upgrade_progress: UPGRADE_PROGRESS_VARIANTS,
  mock_nudge: MOCK_NUDGE_VARIANTS,
};

// Where each nudge should land the student (the sub-goal screen).
export const GROWTH_NUDGE_URLS: Record<GrowthNudgeType, string> = {
  activation: '/student/tracker',
  upgrade_mock: '/student/profile',     // recommended-buddies showcase lives here
  upgrade_progress: '/student/profile',
  mock_nudge: '/student/exams',
};

export function pickGrowthVariant(type: GrowthNudgeType, ctx: CopyContext, recentTitles: string[]) {
  return pick(GROWTH_VARIANTS[type], ctx, recentTitles);
}
