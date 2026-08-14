import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { WHATSAPP_GROUP_URL } from '@/components/onboarding/whatsapp-optin';

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

  it('opens WhatsApp safely in a new tab', () => {
    const s = readFileSync(SCREEN, 'utf8');
    expect(s).toContain('rel="noopener noreferrer"');
    expect(s).toContain('target="_blank"');
  });
});

describe('it is the LAST screen, after the first-day log', () => {
  it('the log tour hands off to it, and it ends the sequence', () => {
    const s = readFileSync(SEQUENCE, 'utf8');
    expect(s).toContain("setStep('whatsapp')");
    expect(s).toContain('<WhatsAppOptIn onDone={finishCommitment} />');
  });

  it('nothing after it gates Home', () => {
    // finishCommitment closes the sequence; the student lands on Home either
    // way. Gating Home on a WhatsApp join would be the Incident #2 shape.
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
