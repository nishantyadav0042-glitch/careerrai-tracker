import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { codeOnly } from './code-only';

const NAIVE = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('codeOnly removes comments and nothing else', () => {
  it('removes line and block comments', () => {
    expect(codeOnly('const a = 1; // set a\nconst b = 2;')).toContain('const a = 1;');
    expect(codeOnly('const a = 1; // set a\nconst b = 2;')).not.toContain('set a');
    expect(codeOnly('/* header */ const a = 1;')).not.toContain('header');
  });

  it('THE BUG: a route path inside a line comment must not open a block', () => {
    // This is the exact shape found in app/auth/callback/route.ts.
    const src = [
      '// gates on /student/* while onboarding_completed is false',
      'const KEEP_ME = 1;',
      '/** jsdoc */',
      'const ALSO_KEEP = 2;',
    ].join('\n');

    expect(NAIVE(src), 'the naive stripper is expected to eat the code').not.toContain('KEEP_ME');
    expect(codeOnly(src)).toContain('KEEP_ME');
    expect(codeOnly(src)).toContain('ALSO_KEEP');
    expect(codeOnly(src)).not.toContain('gates on');
  });

  it('leaves comment-like text inside strings alone', () => {
    expect(codeOnly(`const u = 'https://x.test/a';`)).toContain('https://x.test/a');
    expect(codeOnly(`if (!p.startsWith('//')) go();`)).toContain("'//'");
    expect(codeOnly('const s = `a // b`;')).toContain('a // b');
  });

  it('leaves regex literals alone', () => {
    expect(codeOnly('const r = /a\\/\\/b/;')).toContain('a\\/\\/b');
    expect(codeOnly('const r = /[\\r\\n]/.test(x);')).toContain('[\\r\\n]');
  });

  it('does not mistake division for a regex', () => {
    expect(codeOnly('const x = a / b; // c')).toContain('a / b');
  });

  it('THE SECOND BUG: a template nested inside a ${} substitution', () => {
    // push-recovery/route.ts builds an HTML table this way. A flat scanner
    // reads the INNER opening backtick as the outer template's close, inverts
    // every quote after it, and starts emitting comments as though they were
    // code — so a guard asserting "this route never calls .in('id', …)" fails
    // on a comment explaining that an earlier draft did.
    const src = [
      'const html = `<table>',
      '  ${rows.map((r) => `<tr>${r.name}</tr>`).join(\'\')}',
      '</table>`;',
      "// an earlier draft used .in('id', ids)",
      'const AFTER = 1;',
    ].join('\n');

    const stripped = codeOnly(src);
    expect(stripped, 'the comment must be gone').not.toContain("an earlier draft");
    expect(stripped, 'the template body must survive').toContain('<tr>');
    expect(stripped).toContain('AFTER');
    // Not a NAIVE-vs-this comparison: the regex version is not template-aware
    // at all, so it strips this comment by luck. This bug was introduced by
    // the first draft of THIS scanner, and the test stays to pin the fix.
  });

  it('preserves line count so positions stay meaningful', () => {
    const src = 'a\n// b\n/* c\nd */\ne';
    expect(codeOnly(src).split('\n')).toHaveLength(src.split('\n').length);
  });

  it('recovers the real callback file the naive version blinded', () => {
    // The regression that motivated this module: a guard asserting on this
    // file could not see two thirds of it.
    const raw = readFileSync('src/app/auth/callback/route.ts', 'utf8');
    expect(NAIVE(raw)).not.toMatch(/if\s*\(\s*isNewUser\s*\)/);
    expect(codeOnly(raw)).toMatch(/if\s*\(\s*isNewUser\s*\)/);
  });
});
