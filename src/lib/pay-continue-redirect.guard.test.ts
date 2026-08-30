import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PAYMENT_RETURNS } from '@/lib/payment-return';

const SRC = readFileSync('src/app/pay/continue/page.tsx', 'utf8');

describe('the hand-off landing page cannot become an open redirect', () => {
  it('every allow-listed destination has its own branch', () => {
    // Without this, adding a fourth PAYMENT_RETURNS key would compile, pass
    // every other test, and silently land those students on the buddy screen —
    // a wrong destination is a support ticket, and a silent one is worse.
    for (const key of Object.keys(PAYMENT_RETURNS)) {
      expect(SRC).toContain(`PAYMENT_RETURNS.${key}`);
    }
  });

  it('never redirects to a value derived from the query string', () => {
    // The property that makes the Semgrep finding a false positive, pinned so
    // it stays true: location.replace is only ever handed a PAYMENT_RETURNS
    // constant, never a variable built from the URL.
    const calls = [...SRC.matchAll(/location\.replace\(([^)]*)\)/g)].map((m) => m[1].trim());
    expect(calls.length).toBeGreaterThan(0);
    for (const arg of calls) expect(arg).toMatch(/^PAYMENT_RETURNS\.[a-z]+$/);
  });

  it('carries no nosemgrep SUPPRESSION', () => {
    // This repo's stated rule: change the code, keep the rule armed. An
    // open-redirect suppression inside the payment flow would be the worst
    // place in the product to keep one.
    //
    // Matches the ANNOTATION form (`// nosemgrep`, `/* nosemgrep: rule */`),
    // not the word. The first spelling of this test asserted the word never
    // appeared at all and failed on the page's own comment explaining why it
    // does not use one — a guard that forbids discussing the thing it guards
    // against is a guard that gets deleted rather than fixed.
    expect(SRC).not.toMatch(/(\/\/|\/\*)\s*nosemgrep\b/);
  });
});
