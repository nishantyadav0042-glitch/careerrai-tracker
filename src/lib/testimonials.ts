// REAL testimonials only — every quote here was actually said by a real
// CareerRai student. Never add an invented one. Keep them tiny: one sentence,
// a first name, and a context line. Add new ones as students send them (a
// screenshot / message is your record of consent — get a 👍 before using a
// full name + college).
export interface Testimonial {
  quote: string;
  name: string;
  context: string; // e.g. "CAT aspirant", "targeting IIM-A"
  when?: string;   // recency label, e.g. "this week" — keep accurate as it ages
}

export const TESTIMONIALS: Testimonial[] = [
  {
    // Vedprakash, unprompted on WhatsApp, 15 Jul 2026. Consent given for
    // first name + screenshot.
    quote: 'Genuinely loved this product — it’s too good, and best for all students.',
    name: 'Vedprakash',
    context: 'CAT aspirant',
    when: 'this week',
  },
  {
    // Gargi, unprompted on WhatsApp, 20 Jul 2026 — her FIRST day on the app.
    // Founder-directed use, first name only, number hidden. Her words, trimmed.
    quote: 'This app actually help me to keep a track on daily basis… the log only 5 sec to fill.',
    name: 'Gargi',
    context: 'CAT aspirant',
    when: 'this week',
  },
];

// Live-rendered WhatsApp chats — REAL conversations only, transcribed verbatim
// from the founder's WhatsApp. Rendered as a chat screen (not a screenshot) so
// the student's phone number stays hidden while the conversation stays real.
// Never invent a message, never edit a student's words.
export interface WaMessage {
  from: 'student' | 'careerrai';
  text: string;
  time: string; // as it appeared on the real chat
}
export interface WaChat {
  name: string;
  context: string;
  messages: WaMessage[];
}

export const WA_CHATS: WaChat[] = [
  {
    // Gargi, 20 Jul 2026, 7:33 PM — messaged this on her first day using the
    // app. Founder directed adding it with the number hidden.
    name: 'Gargi',
    context: 'CAT aspirant · her first day on CareerRai',
    messages: [
      {
        from: 'student',
        text: "Hello Nishant 😊\nThis app actually help me to keep a track on daily basis ..\nFurthermore.. it's feature the log in one only 5 sec to fill ... 😊\nToday is my first day to use it is easily to track what to do and how much and how many min 😊",
        time: '7:33 PM',
      },
      {
        from: 'careerrai',
        text: 'Thanks\n\nI really appreciate your feedback.',
        time: '7:34 PM',
      },
    ],
  },
];
