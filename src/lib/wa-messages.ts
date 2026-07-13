// Ready-to-send WhatsApp outreach templates for the leads team. Each is
// personalized with the student's first name and their own dream college, and
// carries the install link. The lead detail page shows these as pickable
// options (the one matching their install status is flagged "Suggested"), and
// a tap opens WhatsApp with the text already typed in.

// The public site — the PWA "download": opening this in Chrome/Safari lets them
// Add to Home Screen. (No Play Store for a PWA.) Change here if the domain moves.
export const SITE_URL = 'https://careerrai-daily.vercel.app';

export interface WaVars {
  firstName: string;
  dreamCollege: string; // resolved label — "IIM Calcutta" or "your dream college"
  siteUrl?: string;
}

// The lead's outreach state, most-blocking first: no app → app but no
// notifications → fully set up. The suggested message matches this.
export type LeadState = 'not_installed' | 'notifications_off' | 'engaged';

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
    {
      key: 'install_full',
      label: 'Install nudge',
      suggestedFor: 'not_installed',
      text: `Hi ${firstName}! 👋 This is Nishant from *CareerRai — the CAT Prep tracking app* you signed up on 🎯

Saw you signed up but haven't installed the app yet 🙂

Quick heads-up — CareerRai works best once it's installed on your phone. That's how we send your daily reminders and track your prep properly, so you don't lose momentum.

Takes 10 seconds 👇
${site}

Tip: open the link in Chrome/Safari → tap "Add to Home Screen."

Your CAT plan is already built and waiting 💪`,
    },
    {
      key: 'install_short',
      label: 'Install (short)',
      suggestedFor: 'not_installed',
      text: `Hey ${firstName}! 👋 Nishant here from *CareerRai — your CAT Prep tracking app* 🎯

One small thing — please install the app so we can send you reminders and track your progress. It's what makes the whole thing work 🙂

10-sec install 👉 ${site}
(open in Chrome/Safari → "Add to Home Screen")`,
    },
    {
      key: 'notifications_on',
      label: 'Turn on reminders',
      suggestedFor: 'notifications_off',
      text: `Hi ${firstName}! 👋 Nishant from *CareerRai — the CAT Prep tracking app* 🎯

You've got the app — nice! 🎉 One thing though: your notifications are switched off, so we can't send your daily reminders. That's the piece that actually keeps you consistent.

Please switch them on 👇
Open the app → allow notifications (or phone Settings → Notifications → CareerRai → On).

Takes 5 seconds — and it's the difference between a plan you follow and one you forget 💪`,
    },
    {
      key: 'keep_going',
      label: 'Keep going',
      suggestedFor: 'engaged',
      text: `Hi ${firstName}! 👋 Nishant from *CareerRai — the CAT Prep tracking app* 🎯

Great — you're all set up! 🎉 Now the only habit that matters: open the app once a day and log your prep in 5 seconds. That's all it takes to stay on track for ${dreamCollege}.

Your plan's ready whenever you are 💪`,
    },
  ];
}

// wa.me needs a country-coded, digits-only number.
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
}
