import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The first viewport, and only the first viewport ─────────────────────────
//
// Founder, 14 Aug: the old hero was busy, the phone mockup pushed the pitch
// below the fold, and a stranger had to scroll before understanding anything.
// The rebuild's whole premise is that nothing important requires a scroll —
// so these guards pin the things that would quietly regress that: a stray
// margin, a re-added card, a rotation that grows the page instead of fading
// into space already reserved for it.

const PAGE = 'src/app/welcome/page.tsx';
const SIX = 'src/components/six-to-one.tsx';

describe('one promise, stated once', () => {
  it('the headline is the exact claim, nothing appended to it', () => {
    const s = readFileSync(PAGE, 'utf8');
    expect(s).toContain('Six jobs are ours.');
    expect(s).toContain('One job is yours.');
  });

  it('the core message and its subcopy are the only other claims', () => {
    const s = readFileSync(PAGE, 'utf8');
    expect(s).toMatch(/Your job is just to[\s\S]*study/);
    expect(s).toContain('Completely free. No credit card.');
  });

  it('removed claims a stranger cannot check stay removed', () => {
    // "About an hour back" and "ALL SIX FREE" are provable only against a
    // real log — value-proof.ts makes them later, to a student, against their
    // own data. A stranger reading them on arrival cannot check either.
    const s = readFileSync(PAGE, 'utf8') + readFileSync(SIX, 'utf8');
    expect(s).not.toContain('About an hour of your day, back');
    expect(s).not.toContain('ALL SIX FREE');
    expect(s).not.toMatch(/all six.*100%\s*free/i);
  });
});

describe('the six read as one settled list, not six competing pills', () => {
  it('renders from SIX_PROMISES — one source, never a second hand-written list', () => {
    const s = readFileSync(SIX, 'utf8');
    expect(s).toContain("from '@/components/six-promises'");
    expect(s).toContain('SIX_PROMISES.map');
  });

  it('rows, not pills: no rounded chip/ring treatment left over', () => {
    const s = readFileSync(SIX, 'utf8');
    expect(s).not.toMatch(/ring-1 ring-stone-200/);
    expect(s).not.toMatch(/flex-wrap/);
  });
});

describe('nothing forces a scroll to understand the pitch', () => {
  it('no large phone-frame mockup leads the hero', () => {
    const s = readFileSync(PAGE, 'utf8');
    expect(s).not.toContain('PhoneFrame');
    expect(s).not.toMatch(/h-\[404px\]|w-\[224px\]/);
  });

  it('exactly one primary CTA and one login door', () => {
    const s = readFileSync(PAGE, 'utf8');
    expect(s.match(/Build my CAT plan — free/g)?.length ?? 0).toBe(1);
    expect(s.match(/Already have an account/g)?.length ?? 0).toBe(1);
  });

  it('the CTA stays reachable regardless of content height', () => {
    expect(readFileSync(PAGE, 'utf8')).toMatch(/sticky\s+bottom-0/);
  });

  it('the live strip is hidden on the shortest supported phone, not just short', () => {
    // iPhone SE is 667px tall — the same baseline funnel-cta.guard.test.ts
    // uses. Below 700px the rotating demo is dropped entirely rather than
    // shrunk further, so the guaranteed-fit content never has to compete with
    // it for space.
    const s = readFileSync(PAGE, 'utf8');
    expect(s).toContain('live-strip');
    expect(s).toMatch(/@media \(max-height:\s*700px\)\s*\{\s*\.live-strip\s*\{\s*display:\s*none;/);
  });

  it('the live strip reserves its own space, so revealing it cannot shift anything', () => {
    const s = readFileSync(PAGE, 'utf8');
    expect(s).toMatch(/live-strip mt-2\.5 min-h-\[\d+px\]/);
  });
});

describe('the rotating visual is real product data, never invented numbers', () => {
  it('every rotation item matches a real product surface already shown elsewhere', () => {
    // Same figures the app has used before on this page (mock percentile,
    // syllabus coverage, target date) — a landing-page glimpse must not
    // promise a shape the product cannot produce.
    const s = readFileSync(PAGE, 'utf8');
    expect(s).toContain('17 Sept');
    expect(s).toContain('92.4%ile');
    expect(s).toContain('61% covered');
  });

  it('is delayed, not instant — stage 1 is the pitch alone', () => {
    const s = readFileSync(PAGE, 'utf8');
    expect(s).toMatch(/REVEAL_DELAY_MS\s*=\s*\d{4}/);
  });

  it('respects reduced motion', () => {
    const s = readFileSync(PAGE, 'utf8');
    expect(s).toContain('prefers-reduced-motion: reduce');
  });
});
