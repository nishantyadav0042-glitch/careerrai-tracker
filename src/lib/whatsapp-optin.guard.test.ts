import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WHATSAPP_GROUP_URL, reachOf } from '@/components/onboarding/whatsapp-optin';

// ── Two messages a day, and we mean it ──────────────────────────────────────
//
// This screen makes a promise ("2 messages a day. That's it.") directly above
// the button that acts on it. That is the most binding kind of copy we write:
// a student who joins and then gets a third message has been lied to on the
// last screen of onboarding, which is the worst possible place to lose trust.
//
// It exists for reach, not onboarding. Measured 14 Aug: 87% finish onboarding,
// but 64% never log a day, 49% never return after day one, and only 31% have
// working push. Every student has a phone number.

const SCREEN = 'src/components/onboarding/whatsapp-optin.tsx';
const SEQUENCE = 'src/components/post-signup-sequence.tsx';

describe('the promise is exact and it leads the card', () => {
  it('states the count, not a vague "few updates"', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain("2 messages a day. That&apos;s it.");
    expect(s).toContain('No promotions. No group chatter. Leave anytime.');
  });

  it('names both messages, so "2" is checkable rather than a claim', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('7 AM');
    expect(s).toContain('9 PM');
  });

  it('the promise sits ABOVE the join button', () => {
    // A commitment printed under the button is a disclaimer; above it, it is
    // the reason to tap.
    const s = readFileSync(SCREEN, 'utf8');
    expect(s.indexOf('2 messages a day')).toBeLessThan(s.indexOf('Join on WhatsApp'));
  });
});

describe('joining is always optional', () => {
  it('offers a skip that reaches Home just the same', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('Not now');
    // Both paths call onDone — neither can strand a student on this screen.
    expect((s.match(/onDone\(\)/g) ?? []).length).toBe(2);
  });

  it('every variant has a way out, including the hardest ask', () => {
    // The unreachable variant words its skip as a cost ("I'll remember on my
    // own") instead of a neutral "Not now" — but it IS still a skip, and there
    // is exactly one skip button for all three.
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('I’ll remember on my own');
    expect(s).toContain('Skip');
    expect((s.match(/track\('whatsapp_skip'/g) ?? []).length).toBe(1);
  });

  it('opens WhatsApp safely in a new tab', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('rel="noopener noreferrer"');
    expect(s).toContain('target="_blank"');
  });
});

describe('reach decides the weight of the ask', () => {
  it('app + push = reachable — they are already covered', () => {
    expect(reachOf({ installed: true, pushOn: true })).toBe('reachable');
  });

  it('no app and no push = unreachable', () => {
    // The founder's line, 14 Aug: this student is dead to us the moment the
    // tab closes. WhatsApp is the only channel left.
    expect(reachOf({ installed: false, pushOn: false })).toBe('unreachable');
  });

  it('exactly one working channel = partial, either way round', () => {
    expect(reachOf({ installed: true, pushOn: false })).toBe('partial');
    expect(reachOf({ installed: false, pushOn: true })).toBe('partial');
  });

  it('the unreachable variant makes the strongest claim of the three', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('This is the only way we can reach you');
    // …and the reachable one does not pretend to be urgent.
    expect(s).toContain('Want your plan on WhatsApp too?');
  });

  it('reads install state rather than a student self-report', () => {
    // "Done — continue" on the openApp screen proves nothing; the install
    // hook's own signal does. pushOn is always false as of 15 Aug — push
    // permission is no longer decided in this ceremony at all (see below), so
    // "not yet asked" is the honest value, not a guess.
    const s = readFileSync(SEQUENCE, 'utf8');
    expect(s).toContain('reachOf({ installed, pushOn: false })');
    expect(s).toContain('const { ui: installUi, installed } = useInstall();');
  });

  it('segments the outcome, so join rate is readable per reach', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain("track('whatsapp_join_click', { reach })");
    expect(s).toContain("track('whatsapp_skip', { reach })");
  });
});

describe('WhatsApp is the ceremony\'s one ask now — every student, same order', () => {
  // Founder, 15 Aug: "even if someone is dead in app we can revive them from
  // WhatsApp — but if someone didn't join WhatsApp and just added the app, we
  // can't revive them." That ranked WhatsApp above push, not alongside it.
  // The reach-weighted two-order dance this used to test (push declined →
  // WhatsApp first; push granted → WhatsApp last) is gone along with the
  // reason for it: push permission is no longer asked in this ceremony at
  // all, so there is nothing left to branch the order on.

  it('promises hands off straight to whatsapp, unconditionally', () => {
    const s = readFileSync(SEQUENCE, 'utf8');
    expect(s).toContain("setStep('whatsapp'); }} />");
  });

  it('the reminders / push-permission step no longer exists in this file', () => {
    const s = readFileSync(SEQUENCE, 'utf8');
    expect(s).not.toContain("step === 'reminders'");
    expect(s).not.toContain('Turn on reminders');
    expect(s).not.toContain('turnOnReminders');
  });

  it('whatsapp hands off to logTour with no branching left to test', () => {
    const s = readFileSync(SEQUENCE, 'utf8');
    expect(s).toContain("onDone={() => setStep('logTour')}");
    expect(s).toContain("onNext={async () => finishCommitment()}");
  });

  it('nothing after it gates Home', () => {
    // finishCommitment closes the sequence; the student lands on Home either
    // way. Gating Home on a WhatsApp join would be the Incident #2 shape —
    // requiring an action to proceed took a whole cohort's logging to zero.
    const s = readFileSync(SEQUENCE, 'utf8');
    expect(s).toMatch(/const finishCommitment = \(\) => \{\s*setVisible\(false\);/);
  });
});

describe('join and skip are measurable', () => {
  it('both fire their own event', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain("track('whatsapp_join_click'");
    expect(s).toContain("track('whatsapp_skip'");
  });

  it('the events are registered, so they are not silently dropped', () => {
    const j = readFileSync('src/lib/journey.ts', 'utf8');
    expect(j).toContain("'whatsapp_join_click'");
    expect(j).toContain("'whatsapp_skip'");
  });
});

describe('the link', () => {
  it('is the real group invite', () => {
    expect(WHATSAPP_GROUP_URL).toMatch(/^https:\/\/chat\.whatsapp\.com\//);
  });
});
