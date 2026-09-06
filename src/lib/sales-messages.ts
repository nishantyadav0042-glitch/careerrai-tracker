import type { DueReason } from '@/lib/call-queue';

// ── One-tap WhatsApp messages for the counsellor, by lane and journey stage ─
//
// Founder, 2 Sep 2026: retention is a journey — real app download, then
// notifications, then the daily study update. A message that ignores where
// the student stands on that journey asks for the wrong thing ("log your
// study" from someone who has not installed the app). So every message is
// chosen by two facts the queue already knows: WHY the student is on today's
// list (the lane) and WHERE they are on the journey (the stage), and it asks
// for exactly one next step.
//
// Pure. The text is shown in WhatsApp for the counsellor to edit before
// sending; nothing here is sent automatically. Claims are kept to what the
// platform knows to be true: a message never says "your plan is ready" or
// "you studied 5 days" unless the data behind the card says so.

/** Where the student stands on the retention journey, most blocking first. */
export type JourneyStage = 'not_installed' | 'notifications_off' | 'push_died' | 'not_logging' | 'logging';

export const JOURNEY_LABEL: Record<JourneyStage, string> = {
  not_installed: 'App not installed',
  notifications_off: 'Notifications off',
  push_died: 'Reminders stopped reaching',
  not_logging: 'Installed, not logging',
  logging: 'Logging this week',
};

/** The ONE next step for each stage — the thing the counsellor asks for. */
export const JOURNEY_NEXT_STEP: Record<JourneyStage, string> = {
  not_installed: 'Get the app installed today',
  notifications_off: 'Turn notifications on so the daily plan reaches them',
  push_died: 'Reinstall reminders — theirs stopped arriving',
  not_logging: 'One logged study task tonight',
  logging: 'Keep the streak — ask what would make it easier',
};

/** Resolve the stage from what the profile and the log history say. */
export function journeyStage(input: {
  appInstalled: boolean;
  pushSubscribed: boolean;
  pushDied: boolean;
  daysSinceLastLog: number | null;
}): JourneyStage {
  if (!input.appInstalled) return 'not_installed';
  if (input.pushDied) return 'push_died';
  if (!input.pushSubscribed) return 'notifications_off';
  if (input.daysSinceLastLog != null && input.daysSinceLastLog <= 7) return 'logging';
  return 'not_logging';
}

export interface MessageInput {
  firstName: string;
  repFirstName: string;
  lane: DueReason;
  stage: JourneyStage | null;
  /** Days since anyone at CareerRai last touched this student. Null = never. */
  daysSilent: number | null;
  siteUrl?: string;
}

const SITE = 'https://careerrai.in';

const sign = (rep: string) => `— ${rep}, CareerRai`;

/**
 * The message for this card. Two or three short lines: what we noticed, one
 * ask, a name. Never a pitch in the first message unless the lane is money.
 */
export function messageFor(m: MessageInput): string {
  const { firstName, repFirstName: rep, lane, stage } = m;
  const site = m.siteUrl ?? SITE;
  const step = (): string => {
    switch (stage) {
      case 'not_installed': return `Install the app so the daily plan actually reaches you: ${site}`;
      case 'notifications_off': return 'Turn on notifications in the app — that is how the daily plan reaches you.';
      case 'push_died': return 'Your reminders stopped arriving. Open the app once and allow notifications again.';
      case 'not_logging': return 'Log just one task tonight — that is the whole ask.';
      case 'logging': return 'You are logging regularly — what would make it easier to keep going?';
      default: return `Open the app and tell me where you are in prep: ${site}`;
    }
  };

  switch (lane) {
    case 'checkout_abandoned':
      return `${firstName}, you started booking a buddy session and stopped. Was it the price, or not sure it fits?\nTell me honestly — I can help either way.\n${sign(rep)}`;
    case 'conversion':
      return `${firstName}, you looked at the buddy option. A single session is ₹399 — one call with someone who cleared CAT, about your weak section.\nWant me to set one up?\n${sign(rep)}`;
    case 'attention':
      return `${firstName}, saw you opened CareerRai but didn't log a study session. What got in the way?\n${step()}\n${sign(rep)}`;
    case 'new_never_logged':
      return `${firstName}, welcome to CareerRai. The first study log is the one that matters.\n${step()}\n${sign(rep)}`;
    case 'going_cold':
      return `${firstName}, you were studying steadily and then it stopped a few days ago. What changed?\n${step()}\n${sign(rep)}`;
    case 'broken_streak':
      return `${firstName}, your streak just broke. The habit is still warm — restart today.\n${step()}\n${sign(rep)}`;
    case 'fresh':
      return `${firstName}, I'm ${rep} from CareerRai. Nobody from our side has spoken to you yet — where are you in CAT prep right now?\n${step()}`;
    case 'rotation': {
      const since = m.daysSilent != null ? `It's been ${m.daysSilent} days since we last spoke.` : "It's been a while since we last spoke.";
      return `${firstName}, ${since} How is prep going?\n${step()}\n${sign(rep)}`;
    }
    case 'callback':
    case 'retry':
    case 'followup':
    default:
      return `${firstName}, this is ${rep} from CareerRai. Tried calling you — when is a good time?\n${sign(rep)}`;
  }
}
