// Ready-to-send WhatsApp outreach templates for the leads team. Each is
// personalized with the student's first name and their own dream college, and
// carries the install link. The lead detail page shows these as pickable
// options (the one matching their install status is flagged "Suggested"), and
// a tap opens WhatsApp with the text already typed in.

// The public site — the PWA "download": opening this in Chrome/Safari lets them
// Add to Home Screen. (No Play Store for a PWA.) Change here if the domain moves.
export { SITE_URL } from '@/lib/site';
import { SITE_URL } from '@/lib/site';

export interface WaVars {
  firstName: string;
  dreamCollege: string; // resolved label — "IIM Calcutta" or "your dream college"
  siteUrl?: string;
}

// The lead's outreach state, most-blocking first: no app → app but no
// notifications → fully set up. The suggested message matches this.
export type LeadState = 'not_installed' | 'notifications_off' | 'push_died' | 'engaged';

export interface WaMessage {
  key: string;
  label: string;
  // Which state this message is written for — used to flag the suggested one
  // on a given lead. 'any' fits every state.
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

export function waMessages(v: WaVars): WaMessage[] {
  const { firstName, dreamCollege } = v;
  const site = v.siteUrl ?? SITE_URL;
  return [
    // Founder rule (21 July): one short block, no emojis, no long paragraphs —
    // "nobody sees that". State the problem bluntly, ask for feedback.
    // ── The two the roster actually needed, 11 Aug ────────────────────────
    //
    // Both come straight out of what the data showed that morning, not from
    // imagination: five BLACKI mentors sitting well under the 5-student cap
    // (two on zero), and 32 students whose verified number we recovered from
    // auth.users but whose NAME the signup race threw away for good.
    {
      key: 'buddy_slots',
      label: 'Buddy slots open (BLACKI)',
      suggestedFor: 'engaged',
      text: `Hi ${firstName}, Nishant from CareerRai. We have 1:1 buddy slots open right now — every mentor is from IIM Bangalore, Lucknow, Calcutta, Kozhikode or Indore. One buddy takes a maximum of 5 students, so they know you personally: your plan, your mocks, where you're stuck. Want one till CAT? Reply and I'll hold a slot. Your plan: ${site}`,
    },
    {
      // The name was never in auth.users, so it cannot be backfilled — it has
      // to be asked. Folded into a message worth sending anyway, so the ask
      // rides along instead of arriving as a bare form-filling request.
      key: 'buddy_slots_ask_name',
      label: 'Buddy slots + ask name',
      suggestedFor: 'engaged',
      text: `Hi! Nishant from CareerRai — you built your study plan with us. We have 1:1 buddy slots open: every mentor is from IIM Bangalore, Lucknow, Calcutta, Kozhikode or Indore, max 5 students each, so the guidance stays properly personal. Want one till CAT? Reply — and do send your name too, only your number saved on our side. Your plan: ${site}`,
    },
    {
      key: 'install_full',
      label: 'Install nudge',
      suggestedFor: 'not_installed',
      text: `Hi ${firstName}, Nishant from CareerRai, CAT prep tracking app. Your plan is built but you haven't installed our app — so we can't share your daily study plan or the topics you have to study today. Install: ${site} (open in Chrome, tap "Add to Home Screen"). Agar koi problem aa rahi hai, feel free to tell me — would love your feedback.`,
    },
    {
      key: 'install_short',
      label: 'Install (short)',
      suggestedFor: 'not_installed',
      text: `Hi ${firstName}, Nishant from CareerRai. Please install the app — without it your daily plan and reminders can't reach you. ${site} → open in Chrome → "Add to Home Screen". Koi dikkat ho to bata do.`,
    },
    {
      key: 'notifications_on',
      label: 'Turn on reminders',
      suggestedFor: 'notifications_off',
      text: `Hi ${firstName}, Nishant from CareerRai. You have the app but notifications are off — so we can't send your daily study plan or today's topics. Open the app and allow notifications (or phone Settings > Notifications > CareerRai > On). Koi problem aa rahi ho to bata do. App: ${site}`,
    },
    {
      key: 'push_recovery',
      label: 'Reminders stopped (push died)',
      suggestedFor: 'push_died',
      text: `Hi ${firstName}, Nishant from CareerRai. Your phone stopped receiving our daily reminders — nothing you did wrong. Fix is simple: open the CareerRai app once, it reconnects automatically. Koi dikkat ho to bata do. App: ${site}`,
    },
    {
      key: 'keep_going',
      label: 'Keep going',
      suggestedFor: 'engaged',
      text: `Hi ${firstName}, Nishant from CareerRai. You are fully set up. One habit from here: log your prep daily, takes 30 seconds. That is what keeps you on track for ${dreamCollege}. Any feedback, tell me directly. App: ${site}`,
    },
  ];
}

// wa.me needs a country-coded, digits-only number.
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
}
