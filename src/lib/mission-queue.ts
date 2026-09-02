import { createAdminClient } from '@/lib/supabase/admin';
import { daysSinceLastLog } from '@/lib/streak-utils';
import { SITE_URL } from '@/lib/site';
import { resolveCatExamDate } from '@/lib/routine-engine';
import { SESSION_PRICE_PAISE } from '@/lib/session-credit';

import { fetchAll } from '@/lib/supabase/fetch-all';
/** The one price a message may quote, from the module that charges it. */
const SESSION_RS = SESSION_PRICE_PAISE / 100;

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tonight's Mission — the founder's execution surface, not analytics. At 7 PM
// the founder opens ONE page and works a queue of ready-to-send missions:
// this student, this reason, this exact blunt message, one tap, next. No
// interpreting data, no writing, no searching, no repeats. This is the leap
// from "who needs attention" to "who + why + the exact thing to send now."

export type Objective = 'log' | 'reconnect' | 'buddy' | 'install' | 'winback';

/** Once messaged, a student is out of the queue for this long. */
export const SEND_COOLDOWN_DAYS = 14;

/**
 * How many alternating pools the no-intent tail is split into.
 *
 * Founder, 6 Aug: "most of the students are repeating... change the pool at
 * least alternate days." The ranking is a pure function of stable facts, so
 * without this the SAME 45 students appear in the SAME order every single
 * night — the queue looked personalised and was actually frozen.
 *
 * Students carrying real intent are never rotated out (see TIER 1 below);
 * only the cold tail takes turns.
 */
const ROTATION_POOLS = 2;

/** Stable per-student bucket. Same student, same bucket, forever. */
function rotationBucket(studentId: string): number {
  let h = 0;
  for (let i = 0; i < studentId.length; i++) h = (h * 31 + studentId.charCodeAt(i)) | 0;
  return Math.abs(h) % ROTATION_POOLS;
}

/** Days since epoch in IST — the thing that flips the pool over at midnight. */
function istDayIndex(nowMs: number): number {
  return Math.floor((nowMs + 5.5 * 3_600_000) / 86_400_000);
}

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  log: 'Get today’s log',
  reconnect: 'Reconnect notifications',
  buddy: 'Book a buddy call',
  install: 'Get the app installed',
  winback: 'Win back — long silent',
};

export type Likelihood = 'high' | 'medium' | 'low';

export interface MissionCard {
  studentId: string;
  name: string;
  firstName: string;
  phone: string | null;
  waNumber: string | null;
  objective: Objective;
  objectiveLabel: string;
  why: string[];
  likelihood: Likelihood;
  message: string;
  rank: number;
}

export interface RootCause {
  total: number;
  notInstalled: number;
  installedNotifOff: number;
  reachableNeverLogged: number;
  wasActiveNowSilent: number;
  activeRecently: number;
}

export interface MissionQueue { cards: MissionCard[]; rootCause: RootCause; sentToday: number }

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}

// The messages — Nishant's voice, founder's format: problem FIRST, mostly
// English, the nudge in Hinglish, no emoji, one objective, and the app link in
// EVERY message (founder, 6 Aug — a message with no link is a message that
// needs a second message).
//
// Rewritten 6 Aug to be direct and to carry real urgency: "ab to 3 mahine bche
// hain, buddy try krke dekhlo". The countdown is COMPUTED from the real exam
// date, never typed in — a hardcoded "3 months" is a lie by the end of the
// month, and nothing kills a founder's credibility faster than a countdown the
// student can tell is wrong.
//
// The rule that has not changed: no invented facts, no fake statistics. The
// fear in these messages is real arithmetic — the days left, and how long this
// student has personally been away.

interface MessageCtx {
  /** Real days to the exam, from catExamDate(). */
  daysToCat: number;
  /** Days since their last log, when we know it. */
  daysSinceLog: number | null;
}

function buildMessage(objective: Objective, first: string, ctx: MessageCtx): string {
  const d = ctx.daysToCat;
  // SITE_URL is interpolated directly in each template, not via a local alias:
  // outreach-link.test.ts greps these literals to prove every message carries
  // the app link, and an alias makes that guard unenforceable.

  switch (objective) {
    case 'log':
      return `${first}, CAT is ${d} days away and today's log is still empty. Nishant here, I built CareerRai. Every student who converts does the same boring thing — they write down what they studied, so by October they know exactly which topic is weak. The ones who don't, find out in the exam hall. 2 minute ka kaam hai, aaj ka log bhar do. ${SITE_URL}`;

    case 'reconnect':
      return `${first}, your reminders have stopped, so your daily plan isn't reaching you at all — and only ${d} days are left. Nishant here, I built CareerRai. Bas app ek baar khol lo, reminders apne aap chalu ho jayenge. Jinka plan roz pahunchta hai unka syllabus October me khatam ho jata hai; baaki November me revision dhoondh rahe hote hain. ${SITE_URL}`;

    case 'buddy':
      return `${first}, ab sirf ${d} din bache hain. You looked at Exam Buddy and left it. Nishant here, I built CareerRai, so let me be straight with you. Book one 45-minute session with an IIM buddy — wo tumhara actual prep padh ke aate hain, batate hain score kahan atka hai, aur you leave with a written next step. Rs ${SESSION_RS}, one time — aur full plan loge within 7 days to Rs ${SESSION_RS} usme adjust ho jata hai. In ${d} dino me guesswork band karo, ek session karke dekho. ${SITE_URL}/student/buddy`;

    case 'install':
      return `${first}, your CAT plan is ready and sitting in your account, but the app isn't installed — so the plan and the reminders can't reach you. ${d} days left. Nishant here, I built CareerRai. 10 second ka kaam hai: ${SITE_URL} Chrome me kholo aur Add to Home Screen dabao. Plan bana pada hai, use to kar lo.`;

    case 'winback': {
      const away = ctx.daysSinceLog != null ? `${ctx.daysSinceLog} din` : 'kuch time';
      return `${first}, ${away} se CareerRai par kuch nahi hua, aur CAT ab ${d} din door hai. Nishant here, I built CareerRai. Main judge nahi kar raha — har serious aspirant ke saath break hota hai. Farq sirf itna hai ki kuch log wapas aate hain. Woh aaj 20 minute aur ek topic se shuru karte hain, aur November tak unhe khud yakeen nahi hota ki wapas aa gaye. Jo nahi aate, woh agle saal yahi soch rahe hote hain. Aaj ek topic. ${SITE_URL}`;
    }
  }
}

export async function buildMissionQueue(admin?: any, limit = 40): Promise<MissionQueue> {
  const db = admin ?? createAdminClient();
  const nowMs = Date.now();
  // Real countdown, computed from the actual exam date. Never a typed-in
  // number — a hardcoded "3 months" is wrong within weeks, and a student can
  // tell. Also drives the FOMO honestly: the fear is arithmetic, not a claim.
  // resolveCatExamDate, not catExamDate — it rolls forward once this year's
  // exam has passed, so the countdown never reads 0 through December.
  const exam = resolveCatExamDate(new Date(nowMs));
  const daysToCat = Math.max(0, Math.ceil((exam.getTime() - nowMs) / 86_400_000));
  const istDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const istDayStart = istDay + 'T00:00:00+05:30';
  const since7d = new Date(nowMs - 7 * 86_400_000).toISOString();
  const since30d = new Date(nowMs - 30 * 86_400_000).toISOString();
  // Cooldown window. Was 3 days, which meant everyone you messaged on Monday
  // was back in Thursday's queue — the founder saw "the same students, every
  // night". Two weeks is long enough that a repeat is a genuine second attempt.
  const sinceCooldown = new Date(nowMs - SEND_COOLDOWN_DAYS * 86_400_000).toISOString();

  const [
    { data: students }, { data: streaks }, { data: eng }, { data: recentEvents },
    { data: notifs }, { data: outreach }, { data: payAttempts }, { data: sessionReqs },
  ] = await Promise.all([
    fetchAll(() => db.from('profiles').select('id, full_name, phone, email, onboarding_completed, app_installed, is_premium, buddy_id, notif_prefs, push_subscription')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true)),
    fetchAll(() => db.from('streak_data').select('student_id, last_log_date')),
    fetchAll(() => db.from('student_engagement').select('student_id, buddy_cta_clicks, mock_opened'), { orderBy: 'student_id' }),
    // 7 days, not "since midnight". The old query asked for events since IST
    // midnight, so opening this page at 1:38 AM looked at a 1.6-hour window and
    // essentially nobody counted as active — the intent boost never fired.
    fetchAll(() => db.from('student_events').select('user_id, session_id, event, created_at').gte('created_at', since7d)),
    fetchAll(() => db.from('notifications').select('user_id, clicked_at').not('pushed_at', 'is', null).gte('pushed_at', since7d)),
    fetchAll(() => db.from('founder_outreach').select('student_id, objective, action, snoozed_until, created_at').gte('created_at', sinceCooldown)),
    // Someone who reached checkout and did not complete is the strongest
    // signal in the whole product — they tried to give us money.
    //
    // 'refunded' is excluded alongside 'paid' (28 Aug 2026). This read was
    // `.neq('status','paid')` and was correct only for as long as a refunded
    // payment wrongly kept status='paid' forever. Once the refund webhook
    // began writing the real status, a refunded student started matching
    // "reached checkout and did not complete" — and they did complete. They
    // paid and asked for the money back. Surfacing them as the product's
    // strongest buying signal would send the founder to chase the one person
    // who has already said no with their wallet.
    fetchAll(() => db.from('student_payments').select('student_id, status, created_at')
      .not('status', 'in', '("paid","refunded")').gte('created_at', since30d)),
    fetchAll(() => db.from('session_requests').select('student_id, created_at').gte('created_at', since30d)),
  ]);

  const lastLogById = new Map((streaks ?? []).map((s: any) => [s.student_id, s.last_log_date]));
  const engById = new Map((eng ?? []).map((e: any) => [e.student_id, e]));
  const openedPush = new Set<string>();
  for (const n of notifs ?? []) if (n.clicked_at) openedPush.add(n.user_id);

  // ── Intent signals — the whole point of this rewrite ────────────────
  // Founder, 6 Aug: message "who opened the app, or want a buddy, or tried to
  // login, or at least put in 0.1". Every one of these already existed in the
  // database and none of them was being used to choose who to contact.
  const sessionsToday = new Map<string, Set<string>>();   // for the copy
  const openedRecently = new Map<string, number>();       // user -> days ago
  const wantsBuddy = new Set<string>();                   // opened the unlock screen
  for (const ev of recentEvents ?? []) {
    if (!ev.user_id) continue;
    const ageDays = (nowMs - Date.parse(ev.created_at)) / 86_400_000;
    if (ev.created_at >= istDayStart) {
      if (!sessionsToday.has(ev.user_id)) sessionsToday.set(ev.user_id, new Set());
      sessionsToday.get(ev.user_id)!.add(ev.session_id ?? 'x');
    }
    if (ev.event === 'app_open' || ev.event === 'screen_view' || ev.event === 'log_open') {
      const prev = openedRecently.get(ev.user_id);
      if (prev == null || ageDays < prev) openedRecently.set(ev.user_id, ageDays);
    }
    if (ev.event === 'buddy_unlock_open' || ev.event === 'daily_pick_open') {
      if (ev.event === 'buddy_unlock_open') wantsBuddy.add(ev.user_id);
    }
  }

  // Reached checkout and did not finish. The strongest signal we have.
  const triedToPay = new Set<string>((payAttempts ?? []).map((r: any) => r.student_id).filter(Boolean));
  // Asked a mentor for a session.
  const askedForSession = new Set<string>((sessionReqs ?? []).map((r: any) => r.student_id).filter(Boolean));

  // Dedupe memory: a student messaged (sent) in the last 3 days, or snoozed and
  // still under snooze, or skipped today, is out of tonight's queue.
  const excludeStudents = new Set<string>();
  const contactedEver = new Set<string>();
  let sentToday = 0;
  for (const o of outreach ?? []) {
    if (o.action === 'sent') {
      // The fetch window IS the cooldown, so anything returned here is still
      // inside it.
      excludeStudents.add(o.student_id);
      contactedEver.add(o.student_id);
      if (new Date(o.created_at).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)) sentToday++;
    }
    if (o.action === 'snoozed' && o.snoozed_until && new Date(o.snoozed_until).getTime() > nowMs) excludeStudents.add(o.student_id);
    if (o.action === 'skipped' && new Date(o.created_at).getTime() > nowMs - 20 * 3600_000) excludeStudents.add(o.student_id);
  }

  const todayBucket = istDayIndex(nowMs) % ROTATION_POOLS;

  // Root-cause tree — where is everyone stuck (attack the biggest branch).
  const rc: RootCause = { total: (students ?? []).length, notInstalled: 0, installedNotifOff: 0, reachableNeverLogged: 0, wasActiveNowSilent: 0, activeRecently: 0 };

  const cards: MissionCard[] = [];
  for (const p of students ?? []) {
    const prefsPush = (p.notif_prefs as { push?: boolean } | null)?.push === true;
    const liveSub = p.push_subscription != null;
    const installed = p.app_installed === true;
    const onboarded = p.onboarding_completed === true;
    const dsl = daysSinceLastLog(lastLogById.get(p.id) as string | null | undefined);
    const e = engById.get(p.id) as any;
    const buddyTaps = (e?.buddy_cta_clicks as number | null) ?? 0;
    const sessions = sessionsToday.get(p.id)?.size ?? 0;
    const openedDaysAgo = openedRecently.get(p.id);
    const paid_attempt = triedToPay.has(p.id);
    const buddyIntent = wantsBuddy.has(p.id) || askedForSession.has(p.id);
    const isPremium = p.is_premium === true;
    const hasBuddy = p.buddy_id != null;

    // ── Root-cause classification (all students) ──
    if (dsl != null && dsl <= 3) rc.activeRecently++;
    else if (!installed) rc.notInstalled++;
    else if (installed && !prefsPush && !liveSub) rc.installedNotifOff++;
    else if (dsl == null) rc.reachableNeverLogged++;
    else rc.wasActiveNowSilent++;

    if (excludeStudents.has(p.id)) continue;

    // ── Assign the single best mission ──
    let objective: Objective | null = null;
    if (onboarded && !installed) objective = 'install';
    else if (prefsPush && !liveSub) objective = 'reconnect';
    else if (!isPremium && !hasBuddy && buddyTaps >= 1 && dsl != null && dsl <= 3) objective = 'buddy';
    else if (onboarded && dsl != null && dsl >= 1 && dsl <= 7) objective = 'log';
    else if (onboarded && dsl == null && installed) objective = 'log';
    else if (onboarded && dsl != null && dsl >= 8) objective = 'winback';
    if (!objective) continue;
    if (isPremium && objective !== 'reconnect') continue; // paying students aren't a founder-growth target

    // ── TIER 1: real intent — always eligible, never rotated out ──
    // These are people who did something deliberate: tried to pay, asked for a
    // buddy, or opened the app in the last three days. There are few of them
    // and they are the entire reason to spend an evening messaging.
    const buddyTapIntent = buddyIntent || buddyTaps >= 1;
    const openedRecentlyEnough = openedDaysAgo != null && openedDaysAgo <= 3;
    const hasIntent = paid_attempt || buddyTapIntent || openedRecentlyEnough;

    // ── TIER 2: the cold tail — takes turns ──
    // Without this the same names surfaced every single night, because rank is
    // a pure function of facts that do not change day to day.
    if (!hasIntent && rotationBucket(p.id) !== todayBucket) continue;

    // ── Why (concrete, trusted signals) + likelihood ──
    const why: string[] = [];
    if (sessions > 0 && (dsl == null || dsl >= 1)) why.push(`opened the app ${sessions}× today but didn’t log — likely just forgot`);
    if (dsl === 0) why.push('logged today already');
    else if (dsl != null) why.push(`${dsl}d since last study`);
    else why.push('never logged a day');
    why.push(liveSub ? (openedPush.has(p.id) ? 'reminders ON · opens pushes' : 'reminders ON') : prefsPush ? 'reminders DIED' : 'reminders OFF');
    if (paid_attempt) why.push('STARTED A PAYMENT and didn’t finish');
    if (wantsBuddy.has(p.id)) why.push('opened the buddy unlock screen');
    if (askedForSession.has(p.id)) why.push('asked a mentor for a session');
    if (buddyTaps > 0) why.push(`tapped buddy ${buddyTaps}×`);
    if (openedRecentlyEnough && sessions === 0) {
      why.push(openedDaysAgo! < 1 ? 'opened the app today' : `opened the app ${Math.round(openedDaysAgo!)}d ago`);
    }
    if (!contactedEver.has(p.id)) why.push('never messaged before');
    if (!installed) why.push('never installed the app');

    let likelihood: Likelihood = 'medium';
    if (paid_attempt || buddyTapIntent) likelihood = 'high';
    else if (openedRecentlyEnough) likelihood = 'high';
    else if (dsl != null && dsl <= 3) likelihood = 'high';
    else if (dsl != null && dsl >= 15) likelihood = 'low';

    // ── Rank (highest-recovery first) ──
    // Founder strategy (23 July): the outreach's MAIN job is maximizing logs
    // and daily-log retention. So log leads; reconnect and install rank high
    // because they're prerequisites TO logging (a student we can't reach or who
    // hasn't installed can't be nudged to log). Buddy is opportunistic revenue,
    // deliberately BELOW the log-serving objectives — never the focus.
    const objectiveWeight: Record<Objective, number> = { log: 100, reconnect: 96, install: 82, buddy: 68, winback: 55 };
    const likWeight = likelihood === 'high' ? 30 : likelihood === 'medium' ? 15 : 0;
    const sessionBoost = sessions > 0 ? 20 : 0;

    // Intent outranks everything. A student who reached checkout and stopped
    // is worth more than any number of "hasn't logged in 4 days" rows, and
    // these weights are large enough that no combination of the base signals
    // can push a cold student above a warm one.
    const intentBoost =
      (paid_attempt ? 400 : 0) +
      (buddyTapIntent ? 250 : 0) +
      (openedRecentlyEnough ? 150 : 0) +
      // A student never contacted before beats one already messaged twice.
      (contactedEver.has(p.id) ? 0 : 40);

    const rank = intentBoost + objectiveWeight[objective] + likWeight + sessionBoost - (dsl ?? 30) * 0.5;

    const first = (p.full_name ?? '').trim().split(' ')[0] || 'there';
    cards.push({
      studentId: p.id,
      name: p.full_name ?? 'Student',
      firstName: first,
      phone: p.phone ?? null,
      waNumber: waNumber(p.phone ?? null),
      objective,
      objectiveLabel: OBJECTIVE_LABEL[objective],
      why,
      likelihood,
      message: buildMessage(objective, first, { daysToCat, daysSinceLog: dsl ?? null }),
      rank,
    });
  }

  cards.sort((a, b) => b.rank - a.rank);
  return { cards: cards.slice(0, limit), rootCause: rc, sentToday };
}
