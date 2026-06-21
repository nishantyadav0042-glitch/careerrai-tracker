// All student-facing motivational copy — edit here, nothing to update in components.

export const CAT_FACTS = [
  'CAT VARC: Read the passage once for structure, then answer — re-reading costs 40+ seconds per set.',
  'CAT DILR: Scan all 4 sets before picking — hardest sets often look easy at first glance.',
  'CAT QA: Eliminate one wrong answer first. Removing one option lifts your odds from 25% to 33%.',
  'Time management: If a question takes >2.5 min, mark and move. Speed > perfection in the first pass.',
  'Accuracy over attempts: 18 correct > 25 attempted with 8 wrong. Negative marking is real.',
  'Mock debriefs matter more than mock scores. Spend equal time reviewing as taking the mock.',
  'VARC RC tip: The answer to inference questions is always supported by the passage — never outside it.',
  'QA tip: For geometry, draw and label every given value before setting up equations.',
  'DILR tip: In seating arrangements, start with the most constrained condition first.',
  'Slot selection: Choose your exam slot (morning/afternoon) and stick to it for all mocks — your body clock matters.',
  'Reading habit: 20 min of dense reading daily (editorial, essays) builds RC speed over 3 months.',
  'CAT scoring: Each section is percentiled separately — a 95%ile in one weak section can save your composite.',
  'Avoid paper changes: In the last 4 weeks, stop learning new techniques — only sharpen what you know.',
  'Mental stamina: CAT is 2 hours. Train with 2-hour timed mocks, not 40-min sectional tests only.',
];

// Shown in FeedbackAnimation when the streak hits one of these exact values.
export const MILESTONE_MESSAGES: Record<number, string> = {
  7:  '7 days straight. This is the consistency you were looking for.',
  15: '15 days in. You\'re proving it — the ability was always there, now the discipline is too.',
  30: 'A full month. This is the version of you that cracks CAT.',
};

export function getComebackHeadline(prevStreak: number): string {
  if (prevStreak > 14) {
    return 'You know you can do this. Consistency was the only missing piece — start again today.';
  }
  return 'Missed a few days? Everyone does. Coming back is what sets you apart.';
}

export function getComebackBody(prevStreak: number): string {
  if (prevStreak >= 7) {
    return `You had a ${prevStreak}-day streak — you know exactly how this works. Log today; that's all it takes to restart.`;
  }
  return 'Every comeback starts small. Log today, and tomorrow you\'ll be ahead of where you are now.';
}
