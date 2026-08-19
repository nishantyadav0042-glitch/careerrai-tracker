import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── Human help is an exception, not the payload ────────────────────────────
//
// Founder, 19 Aug: "Don't make every insight a Buddy CTA. If every insight
// eventually says Talk to an IIM Buddy, students will learn Rai is trying to
// sell me. You've destroyed the whole premise."
//
// And the sharper half of the same instruction: never turn an ordinary
// progress insight into a sales opportunity merely because the student has not
// bought anything. The trigger has to be evidence about the STUDENT, never
// evidence about their payment status.
//
// This guard exists BEFORE the first intervention rule does, on purpose. The
// cheap version of this rule is a copy convention that erodes the first time
// someone wants a conversion bump. The structural version is: insight modules
// cannot express a Buddy offer at all, and the only field that could carry one
// is typed `never` until somebody deliberately widens it in a reviewed change.
//
// What this does NOT do is forbid Buddy CTAs in the app. The buddy surfaces,
// the unlock sheet and the intervention card are all legitimate places to
// offer human help. This is only about the INSIGHT channel -- the one the
// student learns to trust as observation rather than offer.

const ROOT = process.cwd();
const code = (p: string) =>
  readFileSync(join(ROOT, p), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/** Modules whose job is to say what CareerRai noticed. */
const INSIGHT_MODULES = [
  'src/lib/post-log-insight.ts',
  'src/lib/daily-insight.ts',
];

/** Surfaces that render an insight to the student. */
const INSIGHT_SURFACES = [
  'src/components/home/insight-bubble.tsx',
];

const SELL_WORDS = /₹\s*\d|talk to (an? )?(iim )?buddy|book a (buddy|mentor|session)|upgrade|unlock|subscribe|buy now/i;

describe('the insight channel does not sell', () => {
  it('no insight module contains a price or a booking offer', () => {
    const offenders: string[] = [];
    for (const f of INSIGHT_MODULES) {
      if (SELL_WORDS.test(code(f))) offenders.push(f);
    }
    expect(offenders, 'an insight that sells stops being an observation').toEqual([]);
  });

  it('no insight surface renders a price or a booking offer', () => {
    const offenders: string[] = [];
    for (const f of INSIGHT_SURFACES) {
      if (SELL_WORDS.test(code(f))) offenders.push(f);
    }
    expect(offenders).toEqual([]);
  });

  it('the intervention field stays closed until deliberately opened', () => {
    // `intervention?: never` means no rule can populate it without a type
    // change — which is the reviewed seam. If this assertion is ever updated,
    // that edit IS the decision to start offering help from insights.
    const src = code('src/lib/post-log-insight.ts');
    expect(src, 'the CTA seam must remain typed shut').toMatch(/intervention\?:\s*never/);
  });

  it('no insight rule branches on whether the student has paid', () => {
    // The trigger must be evidence about the student's preparation, never
    // their payment status. This is the specific thing the founder called out.
    const offenders: string[] = [];
    for (const f of [...INSIGHT_MODULES, ...INSIGHT_SURFACES]) {
      const src = code(f);
      if (/is_premium|isPremium|has_paid|hasPaid|subscription_status/.test(src)) offenders.push(f);
    }
    expect(
      offenders,
      'an insight that changes because someone has not paid is an advert',
    ).toEqual([]);
  });

  it('post-log insight still produces real value lines', () => {
    // Guard against "passing" this file by gutting the insight engine.
    const src = code('src/lib/post-log-insight.ts');
    expect(src).toMatch(/coverage_advance/);
    expect(src).toMatch(/section_return/);
    expect(src).toMatch(/plan_finished/);
  });
});
