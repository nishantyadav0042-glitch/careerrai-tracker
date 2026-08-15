// Ready-to-send WhatsApp outreach for the leads team. The lead detail page
// shows these as pickable options (the one matching the student is flagged
// "Suggested"), and a tap opens WhatsApp with the text already typed.
//
// ── THE VOICE, locked by the founder 15 Aug ─────────────────────────────────
//
// "Don't tell the student they're receiving premium service. Make them feel
// they have direct access to a human."
//
//   name > designation · relationship > title · plain English > corporate English
//   their benefit > our funnel · two lines, never three
//
// WHAT IS DELIBERATELY ABSENT, and why each was rejected:
//
//   "Relationship Manager"      reads as bank/insurance/credit-card in India.
//                               Signals a sales call, not care.
//   "Student Success Partner"   startup jargon; a 21-year-old does not parse it.
//   "Concierge"                 tries to sound premium, which is the tell.
//   "direct point of contact"   procurement English. Nobody describes
//                               themselves this way out loud.
//   "CareerRai team"            faceless. A name is the human connection.
//   "I've been assigned to you" operational language. The student does not
//                               think "I have been assigned a resource", they
//                               think "is bande ko main directly pakad sakta
//                               hoon". Availability is the signal, not
//                               assignment.
//   corporate English           "we would like to inform", "kindly", "at your
//                               earliest convenience" — reads as a mail merge.
//
// ENGLISH, NOT HINGLISH. Reversed by the founder on 15 Aug after the first
// Hinglish draft: "we are not selling shampoo of 10 rupees." He is right about
// the audience. A CAT aspirant is a prospective MBA, VARC is literally their
// English paper, and this copy also carries a Rs 2,999 ask. Casual Hinglish
// reads as low effort against that, however warm it feels to write.
//
// The resolution is NOT polished marketing English, which reads as a template
// and was the reason Hinglish was tried first. It is PLAIN English: short
// declarative sentences, no adjectives, no softeners, the way one serious
// person writes to another. Respect is the tone, not warmth.
//
// The payload is still three beats: Your plan. I'm here. Message me directly.
// That is the elder-sibling positioning the product is built on, not a service
// desk.
//
// NO TIME IS EVER PROMISED. The founder answers personally and "ASAP", which
// is not a window. So the copy says "message me" and never "I'll reply in
// X hours" — a promise we cannot measure is a promise we will eventually
// break, and being promised personal attention and then treated like everyone
// else is the single biggest trust killer in the student research.

export { SITE_URL } from '@/lib/site';
import { SITE_URL } from '@/lib/site';
import { WHATSAPP_GROUP_URL } from '@/components/onboarding/whatsapp-optin';

/** The one human who sends and answers these. Hardcoded, founder, 15 Aug. */
export const SENDER = 'Nishant';

export interface WaVars {
  firstName: string;
  dreamCollege: string; // resolved label — "IIM Calcutta" or "your dream college"
  siteUrl?: string;
  /**
   * Does a real daily_routines row exist for this student?
   *
   * THIS IS NOT COSMETIC. On 15 Aug, 42 of the 190 not-installed students had
   * no plan at all — 22% of the list. Sending them "tumhara plan ready hai"
   * would have them open the app, find an empty onboarding, and discover that
   * the first thing CareerRai ever told them was untrue. Every message that
   * claims a plan is FILTERED OUT when this is false, rather than merely
   * flagged as unsuggested: the team taps whatever reads well, so the false
   * claim must not be on the screen at all.
   *
   * UNDEFINED MEANS UNKNOWN, AND UNKNOWN IS NOT FALSE. The list views (People,
   * New Leads) build a one-tap link without loading anyone's routines. They
   * pass nothing, so they get the claim-free copy — neither "your plan is
   * ready" (might be a lie) nor "your setup is incomplete" (might also be a
   * lie). Only the lead detail page, which reads daily_routines, earns the
   * strong line.
   */
  hasPlan?: boolean;
  /** Has the student ever logged a day? Undefined = unknown. */
  hasLogged?: boolean;
  /** Full days since their last log. Null = never, undefined = unknown. */
  daysSinceLastLog?: number | null;
}

// The lead's outreach state, most-blocking first: no app → app but no
// notifications → reminders died → fully set up.
export type LeadState = 'not_installed' | 'notifications_off' | 'push_died' | 'engaged';

export interface WaMessage {
  key: string;
  label: string;
  /** Which state this is written for. 'any' fits every state. */
  suggestedFor: LeadState | 'any';
  text: string;
}

// Resolve a lead to one state. Install is the prerequisite (on iPhone push
// only exists once installed), so not-installed outranks notifications-off.
export function leadState(appInstalled: boolean, pushOn: boolean): LeadState {
  if (!appInstalled) return 'not_installed';
  if (!pushOn) return 'notifications_off';
  return 'engaged';
}

/** Two lines, joined the way WhatsApp will show them. */
const two = (a: string, b: string) => `${a}\n${b}`;

/** The second line, identical everywhere: a name, and an open door. */
const ME = `I'm ${SENDER} from CareerRai.`;

export function waMessages(v: WaVars): WaMessage[] {
  const { firstName, dreamCollege, hasPlan, hasLogged, daysSinceLastLog } = v;
  const site = v.siteUrl ?? SITE_URL;
  const out: WaMessage[] = [];

  // ── NOT INSTALLED ────────────────────────────────────────────────────────
  //
  // Claim-free, so it is ALWAYS available — including to callers that never
  // loaded this student's data. True whatever their state: we do send a daily
  // plan, and it is not reaching them. Opens on what they are missing rather
  // than on "you haven't installed our app", which is our metric and invites
  // the honest reply "okay... so?".
  out.push({
    key: 'install_generic',
    label: 'Not installed (safe for any state)',
    suggestedFor: 'not_installed',
    text: two(
      `${firstName}, CareerRai sends you a study plan every day. It isn't reaching you.`,
      `${ME} Install the app — message me if anything breaks. ${site}`,
    ),
  });

  if (hasPlan === true && !hasLogged) {
    // The strongest line we have, and it is only true here. It opens on what
    // the student is missing rather than on what we failed to get them to do:
    // "you haven't downloaded our app" is our metric, and the honest reply to
    // it is "okay… so?".
    out.push({
      key: 'install_plan_ready',
      label: 'Plan ready, not opened',
      suggestedFor: 'not_installed',
      text: two(
        `${firstName}, your CareerRai plan is ready. You haven't opened it yet.`,
        `${ME} Anything you need, message me directly. ${site}`,
      ),
    });
    out.push({
      key: 'install_plan_ready_b',
      label: 'Plan ready, not opened (variant B)',
      suggestedFor: 'not_installed',
      text: two(
        `${firstName}, your plan is built and waiting on CareerRai. All that's left is to start.`,
        `${ME} If anything gets in the way, tell me directly. ${site}`,
      ),
    });
  }

  if (hasPlan === false) {
    // The 42. Their setup genuinely stopped partway, so that is what we say.
    out.push({
      key: 'setup_incomplete',
      label: 'Setup incomplete (no plan yet)',
      suggestedFor: 'not_installed',
      text: two(
        `${firstName}, your CareerRai setup stopped partway. Your plan hasn't been built yet.`,
        `${ME} It takes 10 minutes. Message me if you get stuck. ${site}`,
      ),
    });
  }

  if (hasLogged === true) {
    // Studying on the web without installing. Telling these students they
    // "haven't started" is both false and insulting — they have.
    out.push({
      key: 'install_web_active',
      label: 'Active on web, no app',
      suggestedFor: 'not_installed',
      text: two(
        `${firstName}, you're running CareerRai on the web. Install the app and the daily reminder comes to you.`,
        `${ME} Message me if anything gets stuck. ${site}`,
      ),
    });
  }

  // ── INSTALLED ────────────────────────────────────────────────────────────
  out.push({
    key: 'notifications_on',
    label: 'Turn on reminders',
    suggestedFor: 'notifications_off',
    text: two(
      `${firstName}, your notifications are off. The daily plan isn't reaching you.`,
      `${ME} Two seconds to turn on. Tell me if it doesn't work. ${site}`,
    ),
  });

  out.push({
    key: 'push_recovery',
    label: 'Reminders stopped (push died)',
    suggestedFor: 'push_died',
    text: pushRecoveryMessage(firstName, site),
  });

  if (hasPlan === true && hasLogged === false) {
    out.push({
      key: 'first_log',
      label: 'Never logged a day',
      suggestedFor: 'engaged',
      text: two(
        `${firstName}, your plan is ready but you haven't logged a single day.`,
        `${ME} Tick one task today. Tell me if something is in the way. ${site}`,
      ),
    });
  }

  if (daysSinceLastLog != null && daysSinceLastLog >= 3) {
    out.push({
      key: 'gone_quiet',
      label: `Quiet ${daysSinceLastLog} days`,
      suggestedFor: 'engaged',
      text: two(
        `${firstName}, no log from you in ${daysSinceLastLog} days.`,
        `${ME} What's getting in the way? Tell me directly. ${site}`,
      ),
    });
  }

  out.push({
    key: 'welcome',
    label: 'First contact',
    suggestedFor: 'any',
    text: hasPlan === true
      ? two(
          `${firstName}, your CareerRai plan is ready.`,
          `${ME} Anything at all, message me here. ${site}`,
        )
      : two(
          `${firstName}, your CareerRai account is set up.`,
          `${ME} Anything at all, message me here. ${site}`,
        ),
  });

  // ── JOIN THE CAREERRAI WHATSAPP GROUP ────────────────────────────────────
  //
  // Founder, 15 Aug: for students who signed up before the in-app WhatsApp
  // ask existed (14 Aug), a push notification cannot reach the 74% of them
  // with no push subscription — checked against production, 268 of 360.
  // This is the only channel that reaches all of them: a direct message to
  // their own WhatsApp, the number every one of them has.
  //
  // Same approved copy as the push version (cron/whatsapp-backfill/route.ts)
  // — "we strongly recommend it" — kept as one voice, not two different asks
  // depending on which channel happened to reach a given student.
  out.push({
    key: 'whatsapp_join',
    label: 'Join the WhatsApp group',
    suggestedFor: 'any',
    text: two(
      `${firstName}, join the CareerRai WhatsApp group: ${WHATSAPP_GROUP_URL}`,
      `${ME} I strongly recommend it — 2 messages a day, for consistency. Message me if stuck. ${site}`,
    ),
  });

  // ── THE BUDDY PITCH ──────────────────────────────────────────────────────
  //
  // Rewritten 15 Aug, and the reason is a live false claim, not the voice.
  //
  // These two messages said "every mentor is from IIM Bangalore, Lucknow,
  // Calcutta, Kozhikode or Indore" — the BLACKI framing. Checked against the
  // mentors table that morning, and it is not true of the current roster:
  // Spandana converted IIM Raipur, and Siddhant converted IIM Udaipur,
  // Kashipur, Trichy, Sirmaur, Mumbai and MDI. Two of seven mentors are
  // outside the list the copy promises, so a student who picked either one
  // was sold something we did not deliver — in the message that asks for
  // money.
  //
  // The fix is not a longer list. A list of named institutes is FALSE THE DAY
  // A NEW MENTOR JOINS, and nobody will remember to edit WhatsApp copy when
  // that happens. So the claims are now roster-independent: true of every
  // mentor we have and of every mentor we could add.
  //
  // VERIFIED 15 Aug against profiles where role='buddy' (7 real mentors, the
  // test account excluded). Re-run this before changing either claim:
  //
  //   select full_name, iim_converted, cat_percentile from profiles
  //   where role = 'buddy' order by cat_percentile;
  //
  //   · all 7 have a converted IIM        → "IIM convert kiya hai" holds
  //   · lowest cat_percentile is 98        → "98%ile+" holds
  //   · max students assigned today is 2   → the 5-student cap is not strained
  //
  // Still English-free of a designation but longer than two lines, because
  // this one asks for money and has to carry the reason. The founder's
  // two-line rule was written for activation nudges.
  out.push({
    key: 'buddy_slots',
    label: 'Buddy slots open',
    suggestedFor: 'engaged',
    text: two(
      `${firstName}, want an IIM mentor till CAT? Every mentor converted an IIM, 98+ percentile.`,
      `${ME} One mentor takes 5 students only, so they know you personally. Tell me if you want one. ${site}`,
    ),
  });
  out.push({
    // The name was never in auth.users, so it cannot be backfilled — it has to
    // be asked. Folded into a message worth sending anyway, so the ask rides
    // along instead of arriving as a bare form-filling request.
    key: 'buddy_slots_ask_name',
    label: 'Buddy slots + ask name',
    suggestedFor: 'engaged',
    text: two(
      `You built a study plan on CareerRai, but your name was never saved — we only have your number.`,
      `${ME} Send me your name. And tell me if you want an IIM mentor till CAT. ${site}`,
    ),
  });

  void dreamCollege; // kept on WaVars for the buddy pass; unused by the 2-liners
  return out;
}

/**
 * The push-recovery line on its own.
 *
 * The notification-health screen and the push-recovery cron both want exactly
 * this one message and know nothing about a student's plan or logs. Before
 * this helper they called waMessages() and picked the key out with a `!`,
 * which meant adding the hasPlan gate broke both of them — correctly, since
 * the compiler was pointing out they had no idea whether their claim was true.
 * Giving them the one state-free message is the honest fix; making them pass
 * invented flags would have been the dishonest one.
 */
export function pushRecoveryMessage(firstName: string, siteUrl = SITE_URL): string {
  return two(
    `${firstName}, your reminders stopped. Nothing you did wrong.`,
    `${ME} Open the app once and it reconnects. Tell me if it doesn't. ${siteUrl}`,
  );
}

// wa.me needs a country-coded, digits-only number.
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
}
