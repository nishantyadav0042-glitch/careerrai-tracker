// v1: minimal no-log reminder lines. Rotate so it never feels like the same nag.
// See NOTIF_PARKED.md for the full 6-bucket engine — post-validation.

const NO_LOG_VARIANTS: Array<{
  title: string;
  body: (name: string, dreamCollege: string | null, streak: number) => string;
}> = [
  {
    title: 'Aise kaise IIM jaoge? 😏',
    body: (name) => `${name}, aaj ka log abhi bhi pending hai. 90 seconds.`,
  },
  {
    title: 'CAT khola ya sirf Telegram?',
    body: (name) => `${name}, jo padha wo log kar do. 90 seconds.`,
  },
  {
    title: 'Padhai kar li? Log bhi bhar de boss.',
    body: (_, dreamCollege) =>
      dreamCollege
        ? `${dreamCollege} yaad hai? Aaj ka log pending.`
        : 'Aaj ka session record karo — kal ka track yahaan se hota hai.',
  },
  {
    title: 'Streak ko oxygen chahiye 🔥',
    body: (name, _, streak) =>
      streak > 0
        ? `${streak} din ki streak — day ${streak + 1} ek log dur hai, ${name}.`
        : `${name}, pehla log sab se important hota hai. Karo abhi.`,
  },
  {
    title: 'Bas check kar rahe the. 😏',
    body: (name) => `${name}, buddy bhi wait kar raha hai aaj ke update ka.`,
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
