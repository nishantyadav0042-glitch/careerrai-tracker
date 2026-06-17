// All student-facing motivational copy — edit here, nothing to update in components.

export const ANCHOR_LINES = [
  'Tumhare paas dimaag hai. Consistency hum denge.',
  'CAT akela nahi, hum saath hain.',
  'Roz dikhna — yahi farq banata hai.',
  'Discipline mushkil hai. Isliye hum hain.',
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
