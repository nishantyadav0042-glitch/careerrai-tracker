// Emotional notification engine — 6 buckets, variety not volume.
// Hard cap: 1–2 pushes/day. Never the same message within ~10 sends.
// Variables: {name}, {dreamCollege}, {N} (streak).

export type NotifBucket =
  | 'tease'        // Elder Sibling 😏
  | 'dream'        // Dream Trigger 🎯
  | 'buddy_support'// Friend/Buddy 👬
  | 'streak'       // Streak 🔥
  | 'emotional'    // Emotional ❤️
  | 'achievement'  // Achievement 🏆
  | 'buddy_ping';  // Random Buddy Ping (separate cron)

interface Vars {
  name: string;
  dreamCollege: string | null;
  streak: number;
}

type MsgFn = (v: Vars) => { title: string; body: string };

const BANK: Record<Exclude<NotifBucket, 'buddy_ping'>, MsgFn[]> = {
  tease: [
    (v) => ({ title: 'Aise kaise IIM jaoge? 😏', body: `${v.name}, aaj ka log abhi bhi pending hai.` }),
    (v) => ({ title: 'CAT khola ya sirf Telegram? 😏', body: `${v.name}, 90 seconds mein log kar do.` }),
    (v) => ({ title: 'Sach sach bata.', body: `${v.name}, padhai hui aaj ya bas plan bana?` }),
    (v) => ({ title: 'Future wala tu complain karega 😏', body: `Present wale ${v.name} ko log karna tha.` }),
    (_) => ({ title: 'Attendance lagwane aaye hain.', body: 'Ek log. 90 seconds. Abhi.' }),
    (v) => ({ title: 'Bas strategy bana rahe ho ya padh bhi rahe ho? 😏', body: `${v.name}, aaj ka session record ho.` }),
    (_) => ({ title: 'Phone usage check karein ya khud bataoge?', body: 'Chalo, log karo — tally match karein.' }),
    (v) => ({ title: `${v.name}, percentile WhatsApp status se nahi aata.`, body: 'Aaj ka log bhejna padega.' }),
  ],
  dream: [
    (v) => ({ title: `${v.dreamCollege ?? 'Dream college'} yaad hai na? 🎯`, body: 'Seat abhi bhi wahi hai. Aaj ka log bhi wahi pohonchata hai.' }),
    (v) => ({ title: 'Seat kisi aur ko de dein? 😏', body: `${v.dreamCollege ?? 'That college'} mein teri seat reserved nahi hai — abhi log karo.` }),
    (v) => ({ title: `${v.dreamCollege ?? 'Dream college'} tak ka rasta`, body: 'Aaj ke 2 ghante se guzarta hai. Log it.' }),
    (v) => ({ title: 'Sapna bada hai.', body: `Aaj ka effort chhota mat rakho, ${v.name}. Log now.` }),
    (v) => ({ title: 'Dream college ko ghost mat karo.', body: `${v.dreamCollege ?? 'Your dream college'} abhi bhi wait kar raha hai.` }),
    (_) => ({ title: 'CAT ke baad kya?', body: 'Jo college chahiye — aaj ka ek log usi ke liye hai.' }),
    (v) => ({ title: `Seat: ${v.dreamCollege ?? 'Your goal'}.`, body: `${v.name}, ye moment mat jaane do.` }),
    (_) => ({ title: '2 months mein kahan dikh rahe ho?', body: 'Aaj ka log usi answer ka hissa hai.' }),
  ],
  buddy_support: [
    (_) => ({ title: 'Buddy online tha. Tu kahan tha?', body: 'CAT akela mat lad. Log it — buddy dekhta hai.' }),
    (v) => ({ title: `${v.name}, buddy ka message hai.`, body: 'Update dena hai ya excuse? 😏' }),
    (_) => ({ title: 'Tera buddy comeback ka wait kar raha.', body: 'Ek log. Woh bhi feel karega.' }),
    (_) => ({ title: 'CAT akela mat lad.', body: 'Tera support system ping kar raha hai — log karo.' }),
    (v) => ({ title: `${v.name}, tera team check kar raha hai.`, body: 'Kuch bhi hua ho — log karo. Baat hogi.' }),
    (_) => ({ title: 'Buddy ne aaj feedback diya.', body: 'Log karo toh wo relevant rahe.' }),
    (_) => ({ title: 'Support system active hai.', body: 'Bas ek log ki zaroorat hai aaj.' }),
    (v) => ({ title: `${v.name}, buddy bola — "Zinda ho?"`, body: 'Log karo, confirm karo. 😏' }),
  ],
  streak: [
    (v) => ({ title: `${v.streak} din ki streak. Aaj mat uda dena. 🔥`, body: `${v.name}, itni mushkil se banayi thi.` }),
    (v) => ({ title: `${v.streak} din. Ek aur.`, body: `Bas ek log aur, ${v.name}. Fire jal rahi hai.` }),
    (v) => ({ title: 'Streak ko oxygen chahiye 😏', body: `${v.streak} days strong — day ${v.streak + 1} is 90 seconds away.` }),
    (v) => ({ title: 'Future tu thank you bolega.', body: `${v.streak}-day streak protect karo, ${v.name}.` }),
    (v) => ({ title: 'Fire jal rahi hai — bujhne mat dena.', body: `${v.streak} din ki mehnat ek log se safe rahegi.` }),
    (v) => ({ title: `${v.streak} → ${v.streak + 1}. Itna hi kaam baaqi hai.`, body: `${v.name}, abhi log karo.` }),
    (v) => ({ title: 'Streak ne message bheja hai. 🔥', body: `"${v.name}, please mat chhodo." — Your ${v.streak}-day streak` }),
    (v) => ({ title: 'Consistency ka naam le rahe ho?', body: `${v.streak} days bola ab proof maang raha hai. Log it.` }),
  ],
  emotional: [
    (v) => ({ title: `Sab theek hai na, ${v.name}?`, body: 'Aaj padhai nahi hui toh bhi app kholo. Hum yahin hain.' }),
    (_) => ({ title: 'Tough day tha kya?', body: 'Koi baat nahi. Ek chhota log bhi count hota hai. Hum yahin hain.' }),
    (v) => ({ title: `${v.name}, CAT se pehle khud ko mat hara.`, body: 'Ek step kafi hai aaj. Log it.' }),
    (_) => ({ title: 'Hum yahin hain.', body: 'Kuch hua ho — app kholo. Log it. Kal phir try karenge.' }),
    (v) => ({ title: `${v.name}, kya haal hai?`, body: 'Abhi sirf 90 seconds. Bas aaj ka hisaab do.' }),
    (_) => ({ title: 'Kal phir try karenge.', body: 'Aaj bhi log karo — chahe chhota hi ho. It counts.' }),
    (v) => ({ title: `${v.name}, proud of you.`, body: 'Jo din tough the — un par bhi log tha. Aaj bhi karo.' }),
    (_) => ({ title: 'Paani piya? Break liya?', body: 'Self-care bhi log karo. CAT long game hai.' }),
  ],
  achievement: [
    (v) => ({ title: `${v.name}, pichle week se zyada padhai! 🏆`, body: 'Ye momentum mat khona. Log aaya hai.' }),
    (v) => ({ title: 'Tera comeback officially notice kar liya gaya.', body: `${v.name}, proud of you. Keep it going.` }),
    (_) => ({ title: 'Mock consistency improve hui. 📈', body: 'Trend teri taraf hai. Log it.' }),
    (v) => ({ title: `${v.name}, ye wala week yaad rakhna.`, body: 'Jab sab fit tha — streak, mocks, mood. Screenshot le lo.' }),
    (_) => ({ title: 'Streak pe streak. 🔥', body: 'Ye feel yaad rakhna — jab hard days aayenge.' }),
    (v) => ({ title: `IIM closer than yesterday, ${v.name}.`, body: 'Real talk. Data bolta hai.' }),
    (_) => ({ title: 'Improvement logged. 🏆', body: 'Buddy ko bhi pata hai. Keep going.' }),
    (v) => ({ title: `${v.name}, tu theek kar raha hai.`, body: 'Seriously. Keep this up.' }),
  ],
};

const BUDDY_PING_MESSAGES: Array<{ title: string; body: string }> = [
  { title: 'Bas check kar rahe the. 😏', body: 'Zinda ho? Buddy yaad kar raha tha.' },
  { title: 'Kya haal hai CAT warrior?', body: 'Koi reason nahi — bas ping karna tha.' },
  { title: 'Aaj motivation nahi?', body: 'Attendance lene aaye hain. Ek log toh de do. 😏' },
  { title: 'Paani piya?', body: 'Aur padhai? Buddy check in kar raha hai.' },
  { title: 'Bahut din ho gaye baat kiye.', body: 'Chal, aaj ka log karte hain saath.' },
  { title: 'Random check-in. 😏', body: 'Kuch acha ho raha ho toh batao bhi.' },
  { title: 'Oye, sab theek?', body: 'Buddy wala vibe hai — no reason, just checking.' },
  { title: 'Tu yaad aaya. 😏', body: 'Log karo, dekho kya hota hai.' },
];

export function getBuddyPingMessage(): { title: string; body: string } {
  return BUDDY_PING_MESSAGES[Math.floor(Math.random() * BUDDY_PING_MESSAGES.length)];
}

// Pick a bucket given context, randomized within fit, never same as last bucket.
function pickBucket(opts: {
  streak: number;
  daysMissed: number;
  hasWin: boolean;
  lastBucket: NotifBucket | null;
  availableBuckets?: Exclude<NotifBucket, 'buddy_ping'>[];
}): Exclude<NotifBucket, 'buddy_ping'> {
  const { streak, daysMissed, hasWin, lastBucket } = opts;

  // Build weighted candidates
  let candidates: Array<{ bucket: Exclude<NotifBucket, 'buddy_ping'>; weight: number }> = [];

  if (hasWin) {
    candidates = [
      { bucket: 'achievement', weight: 5 },
      { bucket: 'streak', weight: 2 },
      { bucket: 'tease', weight: 1 },
    ];
  } else if (daysMissed >= 3) {
    // Compassion first — no shame
    candidates = [
      { bucket: 'emotional', weight: 5 },
      { bucket: 'buddy_support', weight: 3 },
      { bucket: 'dream', weight: 2 },
      { bucket: 'tease', weight: 1 },
    ];
  } else if (streak >= 7) {
    candidates = [
      { bucket: 'streak', weight: 4 },
      { bucket: 'tease', weight: 3 },
      { bucket: 'dream', weight: 3 },
    ];
  } else if (streak >= 3) {
    candidates = [
      { bucket: 'streak', weight: 3 },
      { bucket: 'tease', weight: 3 },
      { bucket: 'dream', weight: 2 },
      { bucket: 'emotional', weight: 2 },
    ];
  } else {
    // Default: balanced rotation
    candidates = [
      { bucket: 'tease', weight: 3 },
      { bucket: 'dream', weight: 3 },
      { bucket: 'buddy_support', weight: 2 },
      { bucket: 'emotional', weight: 2 },
    ];
  }

  // Never the same bucket twice in a row
  if (lastBucket) {
    candidates = candidates.filter((c) => c.bucket !== lastBucket);
  }

  if (candidates.length === 0) {
    candidates = [{ bucket: 'tease', weight: 1 }];
  }

  // Weighted random pick
  const total = candidates.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const c of candidates) {
    r -= c.weight;
    if (r <= 0) return c.bucket;
  }
  return candidates[candidates.length - 1].bucket;
}

// Pick a message from a bucket that hasn't been used in the last ~10 sends.
function pickMessage(
  bucket: Exclude<NotifBucket, 'buddy_ping'>,
  vars: Vars,
  recentBodies: string[]
): { title: string; body: string } {
  const pool = BANK[bucket];
  const recentSet = new Set(recentBodies);

  // Prefer unseen messages
  const fresh = pool.filter((fn) => {
    const { body } = fn(vars);
    return !recentSet.has(body);
  });

  const chosen = fresh.length > 0
    ? fresh[Math.floor(Math.random() * fresh.length)]
    : pool[Math.floor(Math.random() * pool.length)];

  return chosen(vars);
}

export interface EngineContext {
  name: string;
  dreamCollege: string | null;
  streak: number;
  daysMissed: number;
  hasWin: boolean;
  lastBucket: NotifBucket | null;
  recentBodies: string[];  // last ~10 notification bodies
  dailySendCount: number;  // sends already done today
  dailyCap?: number;       // default 2
}

export interface EngineResult {
  title: string;
  body: string;
  bucket: Exclude<NotifBucket, 'buddy_ping'>;
  capped: boolean;
}

export function pickNotification(ctx: EngineContext): EngineResult {
  const cap = ctx.dailyCap ?? 2;

  if (ctx.dailySendCount >= cap) {
    // Return empty — caller should skip this student
    return { title: '', body: '', bucket: 'tease', capped: true };
  }

  const bucket = pickBucket({
    streak: ctx.streak,
    daysMissed: ctx.daysMissed,
    hasWin: ctx.hasWin,
    lastBucket: ctx.lastBucket,
  });

  const vars: Vars = {
    name: ctx.name,
    dreamCollege: ctx.dreamCollege,
    streak: ctx.streak,
  };

  const { title, body } = pickMessage(bucket, vars, ctx.recentBodies);

  return { title, body, bucket, capped: false };
}
