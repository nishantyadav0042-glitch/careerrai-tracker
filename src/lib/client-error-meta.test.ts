import { describe, it, expect } from 'vitest';
import { readDeploymentId, describeReactError, fingerprintFor } from './client-error-meta';

// Real strings, taken from production client_errors rows on 22 Aug.
const TRACKER_418 =
  'Error: Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message';
const BUDDY_418 =
  'Error: Minified React error #418; visit https://react.dev/errors/418?args[]=text&args[]= for the full message';
const SUSPENSE_419 = 'Uncaught Error: Minified React error #419; visit https://react.dev/errors/419?args[]=';

describe('which build served this page', () => {
  it('reads the deployment id Next stamps onto its own chunks', () => {
    expect(readDeploymentId([
      'https://careerrai.in/_next/static/chunks/1xyeebhobpx1t.js?dpl=dpl_HqH7SF4CePp7Mk6a6PA9Ko5JKV7V',
    ])).toBe('dpl_HqH7SF4CePp7Mk6a6PA9Ko5JKV7V');
  });

  it('scans past scripts that carry no stamp', () => {
    expect(readDeploymentId([
      'https://careerrai.in/sw.js',
      '',
      'https://careerrai.in/_next/static/chunks/main.js?dpl=dpl_ABC123',
    ])).toBe('dpl_ABC123');
  });

  it('absence is null, never a guess', () => {
    expect(readDeploymentId([])).toBeNull();
    expect(readDeploymentId(['https://careerrai.in/_next/static/chunks/main.js'])).toBeNull();
  });
});

describe('what kind of React failure this was', () => {
  it('separates the two mismatches that were indistinguishable in production', () => {
    expect(describeReactError(TRACKER_418)).toEqual({ code: '418', mismatch: 'html' });
    expect(describeReactError(BUDDY_418)).toEqual({ code: '418', mismatch: 'text' });
  });

  it('a Suspense failure is not a hydration mismatch', () => {
    expect(describeReactError(SUSPENSE_419)).toEqual({ code: '419', mismatch: null });
  });

  it('an ordinary error is not forced into a React shape', () => {
    expect(describeReactError('TypeError: Load failed')).toEqual({ code: null, mismatch: null });
  });
});

describe('grouping', () => {
  it('THE DEFECT THIS FIXES: #418 and #419 no longer collapse together', () => {
    // The old rule blanked every digit, so both became "Minified React error #N".
    expect(fingerprintFor(TRACKER_418, 'x.js', 1))
      .not.toBe(fingerprintFor(SUSPENSE_419, 'x.js', 1));
  });

  it('the tracker and buddy mismatches are separate bugs and group separately', () => {
    expect(fingerprintFor(TRACKER_418, 'a.js', 1)).toBe('react#418:html');
    expect(fingerprintFor(BUDDY_418, 'a.js', 1)).toBe('react#418:text');
  });

  it('the same React bug groups together across chunks and line numbers', () => {
    expect(fingerprintFor(TRACKER_418, 'a.js', 1)).toBe(fingerprintFor(TRACKER_418, 'b.js', 999));
  });

  it('non-React errors keep the previous grouping behaviour', () => {
    expect(fingerprintFor('Load failed at 42', 'chunks/x.js', 7)).toBe('Load failed at N|x.js|7');
  });
});
