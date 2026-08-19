import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// ── No surface may claim verification we have not done ─────────────────────
//
// The unlock sheet told students "Verified IIM alumni" while iim_verified_at
// was null for all eight buddies. A claim about verification, made to a
// student at the moment of payment, with nothing verified behind it.
//
// The founder's rule: iim_verified_at present -> the IIM claim is allowed;
// absent -> do not make it. iim-claim.ts is the gate. This guard stops the
// specific thing that went wrong -- a hard-coded VERIFICATION claim in copy,
// which no gate can catch because it never asks the gate.
//
// Note what this deliberately does NOT do: it does not ban the word IIM from
// the app. Several surfaces describe the product as offering an IIM mentor,
// and 7 of 8 buddies do name an IIM by self-report. Stripping those is a
// positioning decision that belongs to the founder, not a defect to be fixed
// at 2am. What is not defensible, and is therefore blocked here, is asserting
// that the claim has been CHECKED.

const ROOT = process.cwd();
const text = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  text(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return walk(p);
    return /\.tsx$/.test(p) && !/\.test\.tsx$/.test(p) ? [p] : [];
  });
}

const SURFACES = [...walk(join(ROOT, 'src/components')), ...walk(join(ROOT, 'src/app'))];

describe('the IIM claim is gated, not asserted', () => {
  it('no component hard-codes a verification claim', () => {
    // "Verified IIM", "IIM-verified", "verified alumni" — any assertion that
    // the credential has been checked.
    // Widened 19 Aug: the first version required "verified" and "IIM" to be
    // adjacent, and missed `Verified ${pct}%ile IIM alumni mentor` in the
    // buddy showcase — a live false claim sitting one interpolation away from
    // the pattern. Anything asserting a checked credential now trips it.
    const re = /verified[^.<>{}]{0,40}(iim|alumni|mentor)/i;
    const offenders = SURFACES.filter((f) => re.test(code(f))).map((f) => f.replace(`${ROOT}/`, ''));
    expect(
      offenders,
      'say it only through iim-claim.ts, which requires iim_verified_at',
    ).toEqual([]);
  });

  it('the gate requires BOTH a timestamp and a named institute', () => {
    const src = code(join(ROOT, 'src/lib/iim-claim.ts'));
    expect(src).toMatch(/iim_verified_at/);
    expect(src).toMatch(/iim_converted/);
  });

  it('the unverified fallback never names an institute', () => {
    const src = code(join(ROOT, 'src/lib/iim-claim.ts'));
    const fallback = src.slice(src.indexOf('export function mentorCredential'));
    // The percentile branch must not reach for iim_converted.
    const afterGate = fallback.slice(fallback.indexOf('const pct'));
    expect(afterGate, 'the fallback is a percentile, not a softened IIM claim').not.toMatch(/iim_converted/);
  });

  it('the CTA register stays "Talk to", never "Book" or "Hire"', () => {
    const src = code(join(ROOT, 'src/lib/iim-claim.ts'));
    expect(src).toMatch(/Talk to an IIM Buddy/);
    expect(src).toMatch(/Talk to a Buddy/);
    expect(src).not.toMatch(/Book a (Buddy|Mentor)|Hire a/i);
  });
});
