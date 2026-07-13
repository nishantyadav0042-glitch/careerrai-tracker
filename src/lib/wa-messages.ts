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

export interface WaMessage {
  key: string;
  label: string;
  // Which install state this message is written for — used to flag the
  // suggested one on a given lead. 'any' fits either.
  suggestedFor: 'not_installed' | 'installed' | 'any';
  text: string;
}

export function waMessages(v: WaVars): WaMessage[] {
  const { firstName, dreamCollege } = v;
  const site = v.siteUrl ?? SITE_URL;
  return [
    {
      key: 'install_full',
      label: 'Install nudge',
      suggestedFor: 'not_installed',
      text: `Hi ${firstName}! 👋 This is Nishant from CareerRai.

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
      text: `Hey ${firstName}! 👋 Nishant here from CareerRai.

One small thing — please install the app so we can send you reminders and track your progress. It's what makes the whole thing work 🙂

10-sec install 👉 ${site}
(open in Chrome/Safari → "Add to Home Screen")`,
    },
    {
      key: 'keep_going',
      label: 'Keep going',
      suggestedFor: 'installed',
      text: `Hi ${firstName}! 👋 Nishant from CareerRai.

Great — you've got the app installed! 🎉 Now the only habit that matters: open it once a day and log your prep in 5 seconds. That's all it takes to stay on track for ${dreamCollege}.

Your plan's ready whenever you are 💪`,
    },
  ];
}

// wa.me needs a country-coded, digits-only number.
export function waNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.startsWith('91') ? digits : `91${digits}`;
}
