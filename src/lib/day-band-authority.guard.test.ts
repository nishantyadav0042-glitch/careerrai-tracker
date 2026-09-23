import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DAY_FLOOR, DAY_CEILING } from './os/scale-config';

// ── The counsellor's day band is DERIVED, never typed ───────────────────────
//
// Incident #105 (22 Sep): the founder's own tower page told him "The day is
// 50–70 per counsellor, dealt from 4 AM IST". Both halves were false. DAY_CEILING
// had moved 70 -> 120 and the copy did not move with it, and there is no 4 AM
// deck cron at all — sales_opportunity is built on demand when the counsellor
// opens the list.
//
// The founder's lesson from it: "If a human-facing operational belief is not
// derived from the system's authority, it will eventually drift." Retyping the
// band as "50–120" would have been the same defect with a fresher number, and
// would drift again the next time the ceiling moves.
//
// So: any operator-facing surface that states the band must interpolate
// DAY_FLOOR and DAY_CEILING from scale-config. This guard fails the build if a
// literal creeps back in.
//
// SCOPE IS DELIBERATELY NARROW. A blanket ban on two-digit ranges in these
// trees produces false positives immediately and would have to be weakened with
// exemptions to pass — measured before writing this: "12–21 Jul" (a real date
// range in notification-health), "Building (40–64)" (a LIS velocity band),
// "80-88%" (a measured undercount), phone numbers in the import sample, and SVG
// path data. A guard that needs an exemption list to go green teaches people to
// add exemptions. This one asserts something smaller and true: a band stated
// NEXT TO counsellor/rep day language must be derived. It passes today with
// zero exemptions, which is the only condition on which it was worth adding.

/** Comments are stripped: an engineering comment may quote the old "50–70"
 *  precisely to explain why it is gone. Only what the program prints counts. */
const codeOnly = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const ROOTS = ['src/app/admin', 'src/components'];

function tsxFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) tsxFiles(p, out);
    else if (p.endsWith('.tsx') && !/\.test\.tsx$/.test(p)) out.push(p);
  }
  return out;
}

/** A two-digit band within ~40 characters of counsellor/rep day language. */
const LITERAL_BAND_NEAR_DAY =
  /(?:[0-9]{2}\s*[–-]\s*[0-9]{2}[^\n]{0,40}?(?:per counsellor|per rep|a day|the day)|(?:per counsellor|per rep)[^\n]{0,40}?[0-9]{2}\s*[–-]\s*[0-9]{2})/i;

describe("the counsellor's day band is read from scale-config, not typed", () => {
  it('no operator surface states the band as a literal', () => {
    const offenders: string[] = [];
    for (const root of ROOTS) {
      for (const file of tsxFiles(root)) {
        const code = codeOnly(readFileSync(file, 'utf8'));
        const m = LITERAL_BAND_NEAR_DAY.exec(code);
        if (m) offenders.push(`${file}: ${m[0].trim()}`);
      }
    }
    expect(
      offenders,
      'A day band is written as a literal on an operator surface. Import DAY_FLOOR\n' +
      'and DAY_CEILING from @/lib/os/scale-config and interpolate them instead —\n' +
      'a fresher hardcoded number is the same defect (Incident #105). Do NOT add\n' +
      'an exemption to make this pass.\n' + offenders.join('\n'),
    ).toEqual([]);
  });

  it('the tower page derives both ends from the authority', () => {
    const src = readFileSync('src/app/admin/sales/tower/page.tsx', 'utf8');
    expect(src).toContain("from '@/lib/os/scale-config'");
    expect(src).toContain('{DAY_FLOOR}');
    expect(src).toContain('{DAY_CEILING}');
  });

  it('is not vacuous — the pattern catches the string that shipped', () => {
    // The exact copy that was live until 23 Sep.
    expect(
      LITERAL_BAND_NEAR_DAY.test('The day is 50–70 per counsellor, dealt from 4 AM IST'),
    ).toBe(true);
    // And the retyped version that would have been the same defect.
    expect(
      LITERAL_BAND_NEAR_DAY.test('The day is 50–120 per counsellor'),
    ).toBe(true);
  });

  it('does not fire on the legitimate ranges measured in these trees', () => {
    for (const ok of [
      'disconnected — 12–21 Jul gap, closed',
      'Building (40–64)',
      'undercounted real logs by 80-88% until 15 Sep',
      '+91-9876543210,student,CAT',
    ]) {
      expect(LITERAL_BAND_NEAR_DAY.test(ok), ok).toBe(false);
    }
  });

  it('the constants it defends are the ones the queue actually uses', () => {
    expect(DAY_FLOOR).toBe(50);
    expect(DAY_CEILING).toBe(120);
  });
});
