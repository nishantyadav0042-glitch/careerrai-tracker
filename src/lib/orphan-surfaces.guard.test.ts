import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

// ── The repo must admit which surfaces production does not render ───────────
//
// Four components under src/components/ are imported by nothing. Three were
// built and never mounted; one was mounted and later unmounted. Nothing in the
// repo said so, and the cost was real: peer-pulse-card.tsx was polished by a
// LATER commit ("Peer numbers go dark until the base can carry them") after the
// commit that removed it from the tracker page. Work went into a surface no
// student could see, because nothing made its status visible.
//
// buddy-intervention-card.tsx is the sharper case. It ships WITH a guard test
// of its own, which passes -- so the suite reports that a card obeys its copy
// rules while no route renders it. A green guard over an unmounted surface is
// assurance about nothing, and that is the same failure this codebase keeps
// paying for: a confident signal with no reality behind it.
//
// THIS GUARD DELETES NOTHING. Deleting a built surface is a product decision,
// and three of these four are plausibly wanted later. What it does is make the
// set closed and annotated, so that:
//
//   · a NEW orphan cannot appear quietly -- building a surface and forgetting
//     to mount it now fails the suite instead of passing it;
//   · an orphan that gets MOUNTED must be removed from this list deliberately,
//     which is when its "parked, and here is why" note stops being true;
//   · the next agent reads the status before spending a commit on it.
//
// Detection matches the analysis, not a convention: a component is mounted if
// ANY other source file mentions its module path (which covers next/dynamic and
// lazy imports as well as static ones) or imports its basename relatively.
// src/app/** files are route entry points -- they are reached by the router,
// never by an importer, so they are excluded from the orphan search entirely.

const ROOT = process.cwd();

// Pinned 19 Aug. Each entry states why it is parked rather than retired.
const KNOWN_ORPHANS: Record<string, string> = {
  'src/components/buddy/buddy-intervention-card.tsx':
    'Built with its guard in d9044e6 and never mounted on any route. The copy ' +
    'discipline it encodes (no invented mentor speciality, diagnosis before ' +
    'person) is still the rule we want when a mentor surface does ship.',
  'src/components/home/peer-pulse-card.tsx':
    'Mounted on the tracker page, then removed by 253485e in favour of one ' +
    'daily surface. Its ENGINE is NOT dead: lib/os/peer-cohort.ts is live ' +
    'behind /api/community/daily-slot, so deleting this card must not take the ' +
    'engine with it. Parked until the peer surface is wanted again.',
  'src/components/sample-debrief.tsx':
    'From FREEMIUM_IMPLEMENTATION_PLAN.md, never wired to a route. Kept with ' +
    'the rest of that plan rather than retired piecemeal.',
  'src/components/testimonials.tsx':
    'From the same freemium plan, never wired. Reads lib/testimonials.ts, ' +
    'which holds real quotes and IS the no-invented-testimonials authority.',
  'src/components/sales-deck.tsx':
    'Unmounted by SA-1B (20 Aug): /admin/sales now renders the canonical ' +
    'CallDeck queue. NOT parked for later — scheduled for deletion in the ' +
    'SA-1B retire commit together with the ranking it displayed ' +
    '(lib/sales-queue) and the legacy body alias in /api/admin/outreach, ' +
    'after a caller re-proof at delete time (founder rule: swap and delete ' +
    'are separate commits). If you are reading this after SA-1F, it was missed.',
};

// Its own dedicated /api/student/peer-pulse route has no client caller either,
// for the same reason the card has no importer. It is left in place with the
// card it serves; a route is reachable by URL, so "unused" is a weaker claim
// there than for a component, and removing it is not this guard's business.

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.tsx?$/.test(p) ? [p] : [];
  });
}

const allFiles = walk(join(ROOT, 'src'));
const sources = new Map(allFiles.map((f) => [f, readFileSync(f, 'utf8')]));

const components = allFiles.filter(
  (f) => f.startsWith(join(ROOT, 'src/components')) && !/\.test\.tsx?$/.test(f),
);

function isReferenced(component: string): boolean {
  const modulePath = `@/${relative(join(ROOT, 'src'), component).replace(/\.tsx?$/, '')}`;
  const stem = component.replace(/^.*\//, '').replace(/\.tsx?$/, '');
  const relativeImport = new RegExp(`from\\s+['"][^'"]*/${stem}['"]`);
  for (const [file, src] of sources) {
    if (file === component) continue;
    if (src.includes(modulePath) || relativeImport.test(src)) return true;
  }
  return false;
}

const orphans = components.filter((c) => !isReferenced(c)).map((c) => relative(ROOT, c)).sort();

describe('orphan surfaces are declared, not discovered', () => {
  it('has no orphan that this file does not already account for', () => {
    const undeclared = orphans.filter((o) => !(o in KNOWN_ORPHANS));
    expect(
      undeclared,
      'a component nothing renders was added — mount it, or declare here why it is parked',
    ).toEqual([]);
  });

  it('lists no component that is now mounted', () => {
    const stale = Object.keys(KNOWN_ORPHANS).filter((k) => !orphans.includes(k));
    expect(
      stale,
      'these are rendered now — remove them from KNOWN_ORPHANS so the list keeps meaning something',
    ).toEqual([]);
  });

  it('gives every parked surface a reason, not just a name', () => {
    for (const [path, reason] of Object.entries(KNOWN_ORPHANS)) {
      expect(reason.length, `${path} needs a real reason for being parked`).toBeGreaterThan(60);
    }
  });

  it('detects mounting at all — the search is not vacuously empty', () => {
    // If isReferenced() ever broke and returned false for everything, the first
    // assertion would still pass only until the next component was added, and
    // the third would pass forever. Prove the detector finds real mounts.
    const mounted = components.length - orphans.length;
    expect(mounted, 'most components are mounted; a detector finding none is broken').toBeGreaterThan(20);
  });
});

describe('the live peer engine is not mistaken for the parked peer card', () => {
  it('keeps lib/os/peer-cohort.ts reachable from a production route', () => {
    // The card is parked; the engine behind it is not. This assertion exists so
    // that retiring the card later cannot quietly take the daily-slot surface
    // with it -- the exact "declared dead by import grep" mistake.
    const route = readFileSync(join(ROOT, 'src/app/api/community/daily-slot/route.ts'), 'utf8');
    expect(route).toContain('peer-cohort');
  });
});
