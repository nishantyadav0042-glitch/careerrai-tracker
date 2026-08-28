// ── The founder's retention-research queue, as data ─────────────────────────
//
// Founder, 26 Aug: the students who logged on day one and never came back —
// he messages each of them personally and asks what actually went wrong.
//
// This module turns the 212 students who logged at least once into cohorts a
// human can work through: who they are, how far they got, when they stopped,
// and a message the founder can send AS IS. It computes nothing the product
// doesn't already know — streak truth comes from momentumStreak(), the one
// authority, never a re-derivation.
//
// The measured shape this exists to explain (26 Aug): 212 logged once ever,
// 142 exactly once, 70 twice or more, and 175 of 212 have never broken a
// chain — they never started one. The interviews these cohorts feed are the
// only way to learn WHY, and every answer lands back here as data.

export interface LogBreakerRow {
  studentId: string;
  name: string;
  phone: string | null;
  signupDate: string;
  installed: boolean;
  logDays: number;            // distinct days ever logged
  firstLog: string;
  lastLog: string;
  daysSinceLastLog: number;
  longestStreak: number;
  liveStreak: number;         // momentumStreak() truth, not the stored counter
  streakBroken: boolean;
  returnedNextDay: boolean;   // logged again within 1 day of first log
  returnedWithin3: boolean;
  returnedWithin7: boolean;
  lastContactAt: string | null;
  lastContactNote: string | null;
}

export type LogBreakerCohort =
  | '1' | '2' | '3' | '4' | '5' | '6' | '7plus'
  | 'broken'          // built a real chain (longest >= 2) and it is now dead
  | 'never_returned'; // exactly one log, and enough time passed to have returned

export function cohortOf(r: LogBreakerRow, todayIst: string): LogBreakerCohort[] {
  const out: LogBreakerCohort[] = [];
  if (r.logDays >= 7) out.push('7plus');
  else out.push(String(r.logDays) as LogBreakerCohort);
  if (r.longestStreak >= 2 && r.liveStreak === 0) out.push('broken');
  // "Never returned" is an accusation, so it needs the alibi checked: a
  // student whose ONLY log was yesterday hasn't failed to return yet.
  const daysSinceFirst = Math.floor((Date.parse(todayIst) - Date.parse(r.firstLog)) / 86_400_000);
  if (r.logDays === 1 && daysSinceFirst >= 2) out.push('never_returned');
  return out;
}

// ── The WhatsApp drafts ─────────────────────────────────────────────────────
//
// Rules, from the founder's own framing: sound like one person asking another
// a real question. No selling, no price, no guilt, no analytics-speak, no
// "we noticed via our dashboard". One question, answerable in one line.
// The founder sends these BY HAND — nothing here auto-sends, ever.

export function whatsappDraft(r: LogBreakerRow): string {
  const first = r.name.trim().split(' ')[0] || 'hey';

  if (r.logDays === 1) {
    return `Hey ${first}, Nishant here from CareerRai. I saw you logged your study once and then didn't come back to it. `
      + `Was there something confusing, or did it just not feel worth the 30 seconds? `
      + `No pressure at all — one honest line from you helps me fix what's actually broken.`;
  }
  if (r.logDays <= 3) {
    return `Hey ${first}, Nishant from CareerRai. You logged your prep for ${r.logDays} days and then stopped — `
      + `which makes me curious, because you'd already started the habit. `
      + `What changed after those days? Time? The app? The plan itself? One line is enough.`;
  }
  if (r.logDays <= 6) {
    return `Hey ${first}, Nishant from CareerRai. You were logging consistently for ${r.logDays} days — that's rare, most people stop at one. `
      + `Then it stopped — what changed? `
      + `I'm genuinely asking, and even a one-word answer helps.`;
  }
  // 7+ / broken chain — a real habit existed and died.
  return `Hey ${first}, Nishant from CareerRai. You built a real streak — ${r.longestStreak} days — and then it stopped on ${r.lastLog}. `
    + `People who get that far don't usually stop for no reason. What happened? `
    + `I'm asking because I want to fix whatever got in your way, not to push you back.`;
}
