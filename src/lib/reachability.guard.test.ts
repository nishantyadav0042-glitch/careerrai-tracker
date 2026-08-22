import { describe, it, expect } from 'vitest';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
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

// ── The ratchet ─────────────────────────────────────────────────────────────
//
// Four components are unreachable today. They are listed rather than deleted
// because each is a decision someone still has to make — peer-pulse is even
// marked "completed" on the board, which is exactly how this class of bug
// hides. The list may SHRINK freely. It may never grow: a new orphan fails
// this test on the commit that creates it, not 34 days later.

const KNOWN_ORPHANS = [
  'src/components/buddy/buddy-intervention-card.tsx',
  'src/components/home/peer-pulse-card.tsx',
  'src/components/sample-debrief.tsx',
  'src/components/testimonials.tsx',
];

function componentFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__fixtures__') continue;
      componentFiles(full, out);
    } else if (/\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) && !/\.guard\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no NEW component may ship unreachable', () => {
  it('every component is reachable, or is on the known-orphan ledger', () => {
    const orphans = componentFiles(join(process.cwd(), 'src/components'))
      .filter((f) => !reachable.has(f))
      .map((f) => relative(process.cwd(), f).replace(/\\/g, '/'))
      .sort();
    const unexpected = orphans.filter((o) => !KNOWN_ORPHANS.includes(o));
    expect(unexpected).toEqual([]);
  });

  it('the ledger stays honest — a fixed orphan must be removed from the list', () => {
    const stillOrphaned = KNOWN_ORPHANS.filter(
      (o) => !reachable.has(join(process.cwd(), o)),
    );
    expect(stillOrphaned).toEqual(KNOWN_ORPHANS);
  });
});
