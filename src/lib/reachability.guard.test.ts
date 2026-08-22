import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { reachableFiles, isReachable, entrypoints } from './reachability';

// ── The orphan guard ────────────────────────────────────────────────────────
//
// A feature that no import path can reach is not a feature. This test is the
// standing answer to three shipped orphans (Sales workspace, LRDI puzzle,
// evidence capture), and it fails the build rather than waiting 34 days for
// someone to notice a table filling up with rows nobody can see.

const reachable = reachableFiles();

describe('the walker itself is sound', () => {
  it('finds routed entrypoints', () => {
    expect(entrypoints().length).toBeGreaterThan(20);
  });

  it('reaches a component everyone agrees is live', () => {
    expect(isReachable('src/components/DailyTracker/DailyTrackerApp.tsx', reachable)).toBe(true);
  });

  it('follows next/dynamic, not just static imports', () => {
    // DailyTrackerApp pulls LoggingModal in through dynamic(() => import(...)).
    expect(isReachable('src/components/DailyTracker/LoggingModal.tsx', reachable)).toBe(true);
  });
});

describe('the Evidence Layer reaches a student', () => {
  const MUST_REACH = [
    'src/lib/evidence/mock-evidence.ts',
    'src/components/DailyTracker/mock-evidence-card.tsx',
  ];

  for (const file of MUST_REACH) {
    it(`${file} is reachable from a routed entrypoint`, () => {
      expect(isReachable(file, reachable)).toBe(true);
    });
  }
});

// ── One orphan authority, and it is not this file ───────────────────────────
//
// This guard originally carried its own KNOWN_ORPHANS list and its own ratchet.
// That was a mistake made in the same commit that added it: the repo ALREADY
// had an orphan ledger — orphan-surfaces.guard.test.ts, pinned 19 Aug, with
// better annotations than mine — and I did not look before building a second
// one. Two lists of the same four components, each free to drift from the
// other, is precisely the duplicate-authority failure this codebase keeps
// paying for, committed by a guard written to prevent it.
//
// The ledger lives THERE. What lives here is the thing that file does not do:
// a walked import graph from real routed entrypoints, which follows
// next/dynamic and catches a file that is imported but only by other orphans —
// transitively unreachable rather than merely un-imported.

describe('the orphan ledger has exactly one home', () => {
  it('this guard declares no competing list', () => {
    // The invariant is that no orphan list is DECLARED here — not that the
    // name is never mentioned. An earlier version asserted the bare token and
    // failed on its own assertion string, which is the same pin-the-characters
    // mistake the ledger comment above is about.
    const self = readFileSync('src/lib/reachability.guard.test.ts', 'utf8');
    expect(self).not.toMatch(/const\s+KNOWN_ORPHANS/);
    expect(self).not.toMatch(/KNOWN_ORPHANS\s*[:=]\s*[[{]/);
  });

  it('the ledger that does own it is present and populated', () => {
    const ledger = readFileSync('src/lib/orphan-surfaces.guard.test.ts', 'utf8');
    expect(ledger).toContain('KNOWN_ORPHANS');
    expect(ledger).toMatch(/DECIDED 22 Aug/);
  });

  it('the retired surface is gone from the tree and from the ledger', () => {
    expect(existsSync('src/components/sample-debrief.tsx')).toBe(false);
    const ledger = readFileSync('src/lib/orphan-surfaces.guard.test.ts', 'utf8');
    expect(ledger).not.toContain("'src/components/sample-debrief.tsx':");
  });
});
