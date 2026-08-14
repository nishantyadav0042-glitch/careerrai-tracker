import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The card may not claim what we never collected ──────────────────────────
//
// Checked against the live mentors table on 13 Aug: all eight have a name,
// converted IIMs and a CAT percentile. ONE has a bio. NONE has a photo. There
// is no specialities column, and every mentor row has is_repeater = false.
//
// So the tempting version of this card — photo, "specialises in mock
// analysis", "I was a repeater too", a service menu — is entirely invented.
// The founder called it on services ("we didn't collect the same from
// buddies as of now"); it applies to the rest for the same reason. A made-up
// speciality is the mentor version of the ~50% statistic, and it breaks in
// the session the student paid for.

const CARD = 'src/components/buddy/buddy-intervention-card.tsx';
const src = () => readFileSync(CARD, 'utf8');
const rendered = () => src().replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
// Order assertions must read the JSX, not the interface and helpers above it.
const jsx = () => { const r = rendered(); return r.slice(r.lastIndexOf('return (')); };

describe('the diagnosis leads, the person follows', () => {
  it('opens with the finding, not the mentor', () => {
    const s = jsx();
    expect(s.indexOf('We noticed something')).toBeLessThan(s.indexOf('Why you need'));
    // The student's evidence is on screen before the person is introduced.
    expect(s.indexOf('finding.evidence')).toBeLessThan(s.indexOf('mentor.fullName'));
  });

  it('shows the student\'s own evidence, never a generic pitch', () => {
    expect(rendered()).toContain('{finding.evidence}');
  });
});

describe('two doors, and the free one is real', () => {
  it('offers both talking to her and fixing it alone', () => {
    const s = rendered();
    expect(s).toContain('Talk to {first}');
    expect(s).toContain("I&apos;ll fix this myself");
  });

  it('the self-fix door goes to a real screen, not nowhere', () => {
    // A decoy free option would contradict the free product every other
    // screen is built to deliver.
    expect(rendered()).toContain('href={selfFixHref}');
  });
});

describe('the mentor block claims only stored fields', () => {
  it('renders name, converted IIM and percentile — all real columns', () => {
    const s = rendered();
    expect(s).toContain('mentor.fullName');
    expect(s).toContain('mentor.catPercentile');
    expect(s).toContain('iim');
  });

  it('shows a bio ONLY when she actually wrote one', () => {
    // Seven of eight mentors have none; the card must not look broken, and
    // must not fill the gap with something we made up.
    expect(rendered()).toMatch(/\{mentor\.bio &&/);
  });

  it('invents no speciality, service menu, or repeater story', () => {
    const s = rendered().toLowerCase();
    for (const invented of ['specialis', 'specializ', 'i was a repeater', 'mock analysis', 'services']) {
      expect(s, `card claims "${invented}" — no such data exists`).not.toContain(invented);
    }
  });

  it('shows no photo — we have none for any mentor', () => {
    const s = rendered();
    expect(s).not.toContain('photo_url');
    expect(s).not.toContain('<img');
    expect(s).toContain('initials(');
  });

  it('quotes no student count or rating — none are collected, and we are small', () => {
    const s = rendered();
    expect(s).not.toMatch(/helped \d/i);
    expect(s).not.toMatch(/★|reviews/i);
  });
});
