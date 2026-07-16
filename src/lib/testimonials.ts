// REAL testimonials only — every quote here was actually said by a real
// CareerRai student. Never add an invented one. Keep them tiny: one sentence,
// a first name, and a context line. Add new ones as students send them (a
// screenshot / message is your record of consent — get a 👍 before using a
// full name + college).
export interface Testimonial {
  quote: string;
  name: string;
  context: string; // e.g. "CAT aspirant", "targeting IIM-A"
}

export const TESTIMONIALS: Testimonial[] = [
  {
    // Vedprakash, unprompted on WhatsApp, 15 Jul 2026.
    quote: 'Genuinely loved this product — it’s too good, and best for all students.',
    name: 'Vedprakash',
    context: 'CAT aspirant',
  },
];
