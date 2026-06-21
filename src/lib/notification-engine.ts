// v1: minimal no-log reminder lines. Rotate so it never feels like the same nag.
// See NOTIF_PARKED.md for the full 6-bucket engine — post-validation.

const NO_LOG_VARIANTS: Array<{
  title: string;
  body: (name: string, dreamCollege: string | null, streak: number) => string;
}> = [
  {
    title: 'Today\'s log is still pending',
    body: (name) => `${name}, your log for today is still open. It takes 90 seconds.`,
  },
  {
    title: 'Studied today? Log it before you forget',
    body: (name) => `${name}, capture what you studied today — 90 seconds is all it takes.`,
  },
  {
    title: 'Keep tomorrow\'s plan on track',
    body: (_, dreamCollege) =>
      dreamCollege
        ? `${dreamCollege} is the goal — today's log is still pending.`
        : 'Record today\'s session — tomorrow\'s plan is built from it.',
  },
  {
    title: 'Your streak needs today 🔥',
    body: (name, _, streak) =>
      streak > 0
        ? `${streak}-day streak — day ${streak + 1} is just one quick log away, ${name}.`
        : `${name}, the first log is the most important one. Start now.`,
  },
  {
    title: 'Your buddy is waiting on today\'s update',
    body: (name) => `${name}, your buddy is waiting for today's update.`,
  },
];

export function pickNoLogVariant(
  name: string,
  dreamCollege: string | null,
  streak: number,
  recentTitles: string[]
): { title: string; body: string } {
  const recent = new Set(recentTitles);
  const fresh = NO_LOG_VARIANTS.filter((v) => !recent.has(v.title));
  const pool = fresh.length > 0 ? fresh : NO_LOG_VARIANTS;
  const chosen = pool[Math.floor(Math.random() * pool.length)];
  return { title: chosen.title, body: chosen.body(name, dreamCollege, streak) };
}
