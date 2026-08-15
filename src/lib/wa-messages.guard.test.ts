import { describe, it, expect } from 'vitest';
import { waMessages, waNumber, leadState, SENDER, type WaVars } from './wa-messages';

// ── THE OUTREACH VOICE, ENFORCED ────────────────────────────────────────────
//
// Founder, 15 Aug, after researching it from the student's side: "Don't tell
// the student they're receiving premium service. Make them feel they have
// direct access to a human."
//
// Copy rules survive exactly as long as the person who wrote them remembers
// them. These are the ones worth spending a test on, because each was arrived
// at by rejecting a specific alternative that felt right at the time.

const base: WaVars = {
  firstName: 'Yash',
  dreamCollege: 'IIM Calcutta',
  hasPlan: true,
  hasLogged: false,
  daysSinceLastLog: null,
};

/** The 2-liners only. The buddy pitch is deliberately long English — see the
 *  module comment — so it is excluded from the voice rules rather than
 *  silently exempted inside them. */
const twoLiners = (v: Partial<WaVars> = {}) =>
  waMessages({ ...base, ...v }).filter((m) => !m.key.startsWith('buddy_'));

describe('a plan is never claimed for a student who has none', () => {
  it('no message mentions a ready plan when hasPlan is false', () => {
    // The 42. On 15 Aug, 22% of the not-installed list had no daily_routines
    // row. "Tumhara plan ready hai" would have been the first thing CareerRai
    // ever told them, and it would have been false.
    for (const m of waMessages({ ...base, hasPlan: false })) {
      expect(/plan is ready|plan is built|plan ban gaya/i.test(m.text),
        `${m.key} claims a plan that does not exist:\n${m.text}`).toBe(false);
    }
  });

  it('filters the claim out entirely rather than merely un-suggesting it', () => {
    // Structural, not advisory. The team taps whatever reads well, so a false
    // claim must not be on the screen at all.
    const keys = waMessages({ ...base, hasPlan: false }).map((m) => m.key);
    expect(keys).not.toContain('install_plan_ready');
    expect(keys).not.toContain('install_plan_ready_b');
    expect(keys).not.toContain('first_log');
  });

  it('offers the honest alternative instead of going silent', () => {
    // A student with no plan still needs a message; suppressing the false one
    // must not leave the team with nothing to send.
    const keys = waMessages({ ...base, hasPlan: false }).map((m) => m.key);
    expect(keys).toContain('setup_incomplete');
  });

  it('UNKNOWN is not FALSE — a caller that knows nothing claims nothing', () => {
    // The People list and New Leads build a one-tap WhatsApp link without ever
    // loading anyone's routines. If "unknown" collapsed to "no plan", they
    // would tell 148 students with a perfectly good plan that their setup is
    // incomplete — the same lie, pointed the other way.
    const unknown = waMessages({ firstName: 'Yash', dreamCollege: 'IIM Calcutta' });
    const keys = unknown.map((m) => m.key);
    expect(keys).not.toContain('install_plan_ready');   // might be a lie
    expect(keys).not.toContain('setup_incomplete');     // might also be a lie
    expect(keys).not.toContain('first_log');
    for (const m of unknown) {
      expect(/plan is ready|plan is built|hasn't been built|setup stopped partway/i.test(m.text),
        `${m.key} makes a plan claim on unknown data:\n${m.text}`).toBe(false);
    }
  });

  it('a caller that knows nothing still has something true to send', () => {
    // Safety must not mean silence — there is always a claim-free option, and
    // it is suggested for the state that matters most.
    const unknown = waMessages({ firstName: 'Yash', dreamCollege: 'IIM Calcutta' });
    expect(unknown.map((m) => m.key)).toContain('install_generic');
    const generic = unknown.find((m) => m.key === 'install_generic')!;
    expect(generic.suggestedFor).toBe('not_installed');
    // True for every student alive, whatever their state.
    expect(generic.text).toContain('sends you a study plan every day');
  });

  it('never tells an actively-studying student they have not started', () => {
    const active = twoLiners({ hasLogged: true, daysSinceLastLog: 1 });
    for (const m of active) {
      expect(/haven't logged a single day|haven't started/i.test(m.text),
        `${m.key} scolds a student who is already studying:\n${m.text}`).toBe(false);
    }
    expect(active.map((m) => m.key)).toContain('install_web_active');
  });
});

describe('the buddy pitch claims nothing the roster cannot back', () => {
  const buddy = () =>
    waMessages({ ...base, hasLogged: true, daysSinceLastLog: 1 })
      .filter((m) => m.key.startsWith('buddy_'));

  it('never names specific IIMs', () => {
    // The claim that was live until 15 Aug: "every mentor is from IIM
    // Bangalore, Lucknow, Calcutta, Kozhikode or Indore". Two of seven mentors
    // were outside that list — Spandana (IIM Raipur) and Siddhant (IIM
    // Udaipur, Kashipur, Trichy, Sirmaur, Mumbai, MDI) — so a student who was
    // matched with either was sold something we did not deliver, in the
    // message that asks for money.
    //
    // Banning the SHAPE, not that one sentence: any list of named institutes
    // is false the day a new mentor joins, and nobody edits WhatsApp copy when
    // that happens. Roster-independent claims only.
    const NAMED = [
      'Bangalore', 'Lucknow', 'Calcutta', 'Kozhikode', 'Indore', 'Ahmedabad',
      'Raipur', 'Udaipur', 'Kashipur', 'Trichy', 'Sirmaur', 'MDI', 'FMS', 'BLACKI',
    ];
    for (const m of buddy()) {
      for (const n of NAMED) {
        expect(m.text, `${m.key} names "${n}" — false the day the roster changes`)
          .not.toContain(n);
      }
    }
  });

  it('makes only claims that hold for every mentor', () => {
    // Verified 15 Aug against profiles where role='buddy': all 7 real mentors
    // have a converted IIM, and the lowest cat_percentile is 98.
    const pitch = buddy().find((m) => m.key === 'buddy_slots')!;
    expect(pitch.text).toContain('Every mentor converted an IIM');
    expect(pitch.text).toContain('98+ percentile');
    // The cap is a policy we keep, not a count we read — stated as a limit on
    // the mentor, which is what makes it a promise about attention.
    expect(pitch.text).toContain('5 students');
  });

  it('invents no mentor attribute we never collected', () => {
    // No photo, no speciality, no "I was a repeater too", no student count, no
    // rating. The mentors table has none of those, and an invented speciality
    // breaks in the session the student paid for.
    for (const m of buddy()) {
      expect(/photo|specialis|specializ|rating|reviews|repeater too/i.test(m.text),
        `${m.key} invents a mentor attribute:\n${m.text}`).toBe(false);
    }
  });
});

describe('the copy is English, and stays English', () => {
  // Reversed by the founder on 15 Aug after a full Hinglish draft: "we are not
  // selling shampoo of 10 rupees." A CAT aspirant is a prospective MBA, VARC is
  // literally their English paper, and this copy also carries a Rs 2,999 ask.
  //
  // Worth a test because the reversal is easy to forget and Hinglish is the
  // natural thing to reach for when writing warmly — the first draft of the
  // welcome message kept a Hindi second line through the whole translation pass
  // and only this check found it.
  const HINGLISH = [
    'nahi', 'toh', 'tumhara', 'tumhare', 'tumhe', 'tum', 'bol', 'dena', 'dikkat',
    'koi', 'kuch', 'karo', 'kya', 'mujhe', 'merko', 'hai', 'hoon', 'raha', 'rahi',
    'jayega', 'leta', 'sirf', 'abhi', 'roz', 'naam', 'bhej', 'wo', 'yahin', 'din',
  ];

  it('no outreach message drifts back into Hinglish', () => {
    for (const hasPlan of [true, false, undefined]) {
      for (const hasLogged of [true, false, undefined]) {
        for (const m of waMessages({ ...base, hasPlan, hasLogged, daysSinceLastLog: 6 })) {
          for (const w of HINGLISH) {
            expect(new RegExp(`\\b${w}\\b`, 'i').test(m.text),
              `${m.key} contains "${w}":\n${m.text}`).toBe(false);
          }
        }
      }
    }
  });

  it('is plain English, not corporate English', () => {
    // The reason Hinglish was tried first: marketing English reads as a mail
    // merge. Plain short sentences are the resolution, not a register change.
    const CORPORATE = [
      'we would like to', 'at your earliest', 'please be advised', 'do the needful',
      'reach out to', 'circle back', 'as per our records', 'we regret to inform',
      'thank you for your interest', 'looking forward to hearing',
    ];
    for (const m of waMessages({ ...base, daysSinceLastLog: 6 })) {
      for (const c of CORPORATE) {
        expect(m.text.toLowerCase(), `${m.key}: "${c}"`).not.toContain(c);
      }
    }
  });
});

describe('the rejected vocabulary can never come back', () => {
  const BANNED = [
    // Titles, each rejected for a stated reason in the module comment.
    'Relationship Manager', 'Success Manager', 'Student Manager', 'Concierge',
    'Success Partner', 'Student Partner', 'Care Manager', 'Student Advisor',
    'point of contact', 'customer support', 'account manager',
    // Corporate softeners.
    'if you need any assistance', 'please do not hesitate', 'kindly',
    'valued customer', 'premium service', 'dear student',
  ];

  it('no outreach message uses a service designation', () => {
    for (const m of twoLiners()) {
      for (const b of BANNED) {
        expect(m.text.toLowerCase()).not.toContain(b.toLowerCase());
      }
    }
    // And across every state combination, not just the default one.
    for (const hasPlan of [true, false]) {
      for (const hasLogged of [true, false]) {
        for (const m of twoLiners({ hasPlan, hasLogged, daysSinceLastLog: 5 })) {
          for (const b of BANNED) {
            expect(m.text.toLowerCase(), `${m.key}: "${b}"`).not.toContain(b.toLowerCase());
          }
        }
      }
    }
  });

  it('never promises a reply time it cannot keep', () => {
    // The founder answers personally and "ASAP", which is not a window. A
    // measurable promise we do not measure is the trust failure the student
    // research named as the worst one.
    for (const m of twoLiners({ daysSinceLastLog: 5 })) {
      expect(/within \d|\d+ (hours?|hrs?|minutes?|mins?)\b(?!.*(?:to turn on|to sign up))|turnaround|24x7|24\/7|guaranteed reply/i.test(m.text),
        `${m.key} promises a response time:\n${m.text}`).toBe(false);
    }
  });
});

describe('the shape the founder asked for', () => {
  it('every outreach message is exactly two lines', () => {
    for (const hasPlan of [true, false]) {
      for (const hasLogged of [true, false]) {
        for (const m of twoLiners({ hasPlan, hasLogged, daysSinceLastLog: 6 })) {
          const lines = m.text.split('\n').filter((l) => l.trim() !== '');
          expect(lines.length, `${m.key} is ${lines.length} lines:\n${m.text}`).toBe(2);
        }
      }
    }
  });

  it('every outreach message names the human and opens the door', () => {
    for (const hasPlan of [true, false]) {
      for (const m of twoLiners({ hasPlan, daysSinceLastLog: 6 })) {
        expect(m.text, `${m.key} has no name`).toContain(SENDER);
        expect(/message me|tell me|send me/i.test(m.text), `${m.key} never invites a reply`).toBe(true);
      }
    }
  });

  it('opens on the student, never on our funnel', () => {
    for (const hasPlan of [true, false]) {
      for (const hasLogged of [true, false]) {
        for (const m of twoLiners({ hasPlan, hasLogged, daysSinceLastLog: 6 })) {
          // The FIRST CLAUSE decides whose problem this is. "Your plan is
          // ready. You haven't opened it yet." opens on their asset; the gap
          // follows. "You haven't downloaded our app" opens on our metric, and
          // the honest student reply to that is "okay... so?".
          //
          // So this bans opening on OUR funnel specifically, not the word
          // "haven't" — a student's own unopened plan is their business, not
          // our install count.
          const first = m.text.split('\n')[0].split(/[.—]/)[0].toLowerCase();
          expect(/(down)?loaded (our|the) app|installed (our|the) app|completed (our )?onboarding|signed up yet/i.test(first),
            `${m.key} opens on our funnel:\n${first}`).toBe(false);
        }
      }
    }
  });

  it('stays short enough to be read on a lock screen', () => {
    for (const m of twoLiners({ daysSinceLastLog: 6 })) {
      // WhatsApp shows roughly two lines of preview on a locked phone. English
      // runs longer than the Hinglish first draft for the same content, so the
      // cap moved with the language — it still exists, and it still bites.
      expect(m.text.length, `${m.key} is ${m.text.length} chars`).toBeLessThan(240);
    }
  });

  it('uses no emoji', () => {
    for (const m of twoLiners({ daysSinceLastLog: 6 })) {
      expect(/\p{Extended_Pictographic}/u.test(m.text), `${m.key} has an emoji`).toBe(false);
    }
  });
});

describe('the quiet-student message only fires on a real gap', () => {
  it('is absent when they logged today or yesterday', () => {
    for (const d of [null, 0, 1, 2]) {
      const keys = twoLiners({ hasLogged: true, daysSinceLastLog: d }).map((m) => m.key);
      expect(keys, `daysSinceLastLog=${d}`).not.toContain('gone_quiet');
    }
  });

  it('states the real number of days, never a vague "a while"', () => {
    const m = twoLiners({ hasLogged: true, daysSinceLastLog: 6 }).find((x) => x.key === 'gone_quiet');
    expect(m).toBeDefined();
    expect(m!.text).toContain('6 days');
  });
});

describe('lead state and number formatting are unchanged', () => {
  it('install outranks notifications', () => {
    expect(leadState(false, false)).toBe('not_installed');
    expect(leadState(false, true)).toBe('not_installed');
    expect(leadState(true, false)).toBe('notifications_off');
    expect(leadState(true, true)).toBe('engaged');
  });

  it('country-codes the number for wa.me', () => {
    expect(waNumber('+91 98765 43210')).toBe('919876543210');
    expect(waNumber('9876543210')).toBe('919876543210');
    expect(waNumber('919876543210')).toBe('919876543210');
  });
});
