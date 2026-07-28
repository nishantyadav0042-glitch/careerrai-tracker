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
  {
    // Instagram DM to the founder, 25 Jul 2026, in reply to an open "koi
    // feedback ho to please share". Founder directed adding it with the
    // student's name and handle WITHHELD — so no name appears, only the
    // channel. Words verbatim (Hinglish kept — translating it would be
    // editing it).
    // App Review 2.3.10 (28 Jul 2026): the visible context line used to read
    // "via Instagram, name withheld". Naming a third-party platform in shipped
    // UI is what the rejection was about, so the channel now lives only in this
    // comment. Keep it that way.
    quote: 'Bahut achi hai bhaiya bahut achi 🧿🙌',
    name: 'A CAT aspirant',
    context: 'name withheld',
    when: 'this week',
  },
];

// REMOVED 28 Jul 2026 — App Store rejection, guideline 2.3.10 (third-party
// platforms). WA_CHATS rendered a replica of WhatsApp's interface (its header
// green, chat wallpaper, bubble colours and ✓✓ receipts) inside our app, and
// the accompanying raw screenshot carried an Android status bar. Both are gone.
//
// Gargi's quote survives in TESTIMONIALS above, in our own styling — that is
// the compliant way to show a real student's words. Do not reintroduce a chat
// replica or a messaging-app screenshot. See docs/APP-STORE-SUBMISSION.md.
