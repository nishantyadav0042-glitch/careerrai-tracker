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
  7:  '7 din lagataar. Yeh wahi consistency hai jo tum dhoondh rahe the.',
  15: '15 din. Tum prove kar rahe ho — dimaag tha hi, ab discipline bhi hai.',
  30: 'Poora mahina. Yeh wo version hai jo CAT nikalta hai.',
};

export function getComebackHeadline(prevStreak: number): string {
  if (prevStreak > 14) {
    return 'Tu jaanta hai tu kar sakta hai. Bas consistency chahiyi thi — aaj se phir shuru.';
  }
  return 'Gire the? Sab girte hain. Wapas aana hi farq hai.';
}

export function getComebackBody(prevStreak: number): string {
  if (prevStreak >= 7) {
    return `${prevStreak}-din ki streak thi. Tumhe pata hai kaise karte hain. Aaj log karo — bas itna kaafi hai.`;
  }
  return 'Har wapsi choti hoti hai. Aaj log karo, kal khud ki nazar mein upar jaoge.';
}
