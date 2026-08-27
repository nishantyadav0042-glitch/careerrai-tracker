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
//
// 22 Aug — the founder asked for a decision on all four. Three stay parked with
// their reasons sharpened below. ONE WAS RETIRED: sample-debrief.tsx is gone.
// It was the only one of the four with nothing to salvage — no live engine
// behind it (unlike peer-pulse), no encoded copy rule worth keeping (unlike
// buddy-intervention), and no real data authority in front of it (unlike
// testimonials). What it did have was three hardcoded error counts — six silly
// mistakes, four time, two conceptual — presented to a student as a taste of a
// real mock analysis. Since 22 Aug this codebase states measured facts and
// labels everything else; a component whose entire content is invented numbers
// dressed as findings is not something to keep warm for later. The
// sample_debrief_viewed engagement event stays: it records history that really
// happened.
const KNOWN_ORPHANS: Record<string, string> = {
  'src/components/recommended-buddies.tsx':
    'PARKED 26 Aug when the profile storefront was removed (founder: My ' +
    'Profile is not a sales surface, one buddy pitch per student per day). ' +
    'This was its only mount. It stays parked, not retired, because ' +
    'buddy-choice.guard.test.ts treats it as the encoded spec for how a ' +
    'showcase must behave — one recommended profile first, alternatives as a ' +
    'question — and that discipline is what any future mount inherits.',
  'src/components/buddy/buddy-intervention-card.tsx':
    'Built with its guard in d9044e6 and never mounted on any route. The copy ' +
    'discipline it encodes (no invented mentor speciality, diagnosis before ' +
    'person) is still the rule we want when a mentor surface does ship. ' +
    'DECIDED 22 Aug: stays parked, and the reason is now specific rather than ' +
    'sentimental. The card opens with the student\'s own trajectory, which it ' +
    'reads from buddy-case. We hold 24 mocks across 20 students, so for almost ' +
    'everyone that opening line would be empty or thin — the card would ship ' +
    'its weakest possible version on the exact surface that asks for money. ' +
    'Revisit at the Radar/Evidence review, not before.',
  'src/components/home/peer-pulse-card.tsx':
    'Mounted on the tracker page, then removed by 253485e in favour of one ' +
    'daily surface. Its ENGINE is NOT dead: lib/os/peer-cohort.ts is live ' +
    'behind /api/community/daily-slot, so deleting this card must not take the ' +
    'engine with it. DECIDED 22 Aug: stays parked. The one daily surface it ' +
    'was removed for is now the Daily Pick and the Radar drills; remounting ' +
    'this would re-fragment Home against the ruling that removed it, and ' +
    'would be building at a moment the instruction is to observe.',
  'src/components/testimonials.tsx':
    'From the same freemium plan, never wired. Reads lib/testimonials.ts, ' +
    'which holds real quotes and IS the no-invented-testimonials authority. ' +
    'DECIDED 22 Aug: stays parked and is the cheapest of the four to keep — ' +
    'it renders nothing without real quotes, so it cannot misfire. Mounting ' +
    'it is a marketing decision with consent implications (a student agreed ' +
    'to a quote, not to a placement) and carries the App Store 2.3.10 ' +
    'constraint. Not an engineering call to make unilaterally.',
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

// ── The ledger did not cover LIBRARY modules, and that is where it hurt ────
//
// KNOWN_ORPHANS above governs components/**. Nothing governed lib/**, so a
// non-visual module could sit fully written, fully tested and imported by
// nothing at all, indefinitely and invisibly. Two did:
//
//   event-policy.ts   — a complete second answer to "which channels does this
//                       event use?", while the live answer sat in dispatch().
//                       Found 27 Aug; it is now the live authority.
//   os/exception.ts   — the SCALE-CONTRACT's "one primitive for every
//                       operational problem", which no producer emits through.
//
// A component nobody renders is a wasted screen. A LIBRARY nobody imports is
// worse: it is a second authority waiting for someone to wire it, and whoever
// does will not know what the live one already decided. Same ledger, extended
// — because a second ledger for lib/** would be the exact duplicate-authority
// mistake this file's own header records making once already.

const KNOWN_PARKED_MODULES: Record<string, string> = {
  'src/lib/os/exception.ts':
    'PARKED. The SCALE-CONTRACT primitive: one Exception shape for every ' +
    'operational domain, aggregated into the Founder Inbox. Deliberately ' +
    'zero-infra (a type, a pure aggregation, a presentation rule) and kept ' +
    'because it is the founder\'s stated architecture, not a spare part. It ' +
    'is unwired because the PRODUCERS have not been converted: founder-inbox ' +
    'and mentor-ops still shape their own rows. Wiring it is its own cycle. ' +
    'Delete only with the founder, and only together with that contract.',
  'src/lib/facts/registry.ts':
    'PARKED. The canonical fact registry: one place a fact is DEFINED, so a ' +
    'second definition cannot be added quietly. Every producer in it is pure. ' +
    'It is unwired because consumers currently import facts/daily-log.ts ' +
    'DIRECTLY — reads/daily-log.ts is the live shell — so the registry is the ' +
    'middle layer nobody routes through yet. Keep: it is the anti-duplication ' +
    'authority for facts, and deleting it would leave the second-definition ' +
    'problem with nothing standing against it. Wiring it means moving the ' +
    'existing consumers onto it, which is its own cycle.',
  'src/lib/reachability.ts':
    'KEEP. Build-time analysis, not product code: it walks the import graph ' +
    'from routed entrypoints so reachability.guard.test.ts can fail the build ' +
    'on an unreachable surface. Having no runtime importer is the correct ' +
    'shape for it — the same shape every other guard helper here has — and ' +
    'its consumer is a test on purpose.',
};

/** lib modules with no NON-TEST importer anywhere. */
const parkedModules = (() => {
  const libs = allFiles.filter((f) => f.includes('/src/lib/') && /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
  const out: string[] = [];
  for (const lib of libs) {
    const stem = lib.replace(/^.*\//, '').replace(/\.ts$/, '');
    const re = new RegExp(`from\\s+['"][^'"]*/${stem}['"]`);
    let referenced = false;
    for (const [file, src] of sources) {
      if (file === lib || /\.test\.tsx?$/.test(file)) continue;
      if (re.test(src)) { referenced = true; break; }
    }
    if (!referenced) out.push(relative(ROOT, lib));
  }
  return out.sort();
})();

describe('a library module nobody imports is declared, not discovered', () => {
  it('detects real imports — the search is not vacuously empty', () => {
    const libTotal = allFiles.filter((f) => f.includes('/src/lib/') && /\.ts$/.test(f) && !/\.test\.ts$/.test(f)).length;
    expect(libTotal - parkedModules.length, 'a detector that finds nothing imported is broken').toBeGreaterThan(50);
  });

  it('has no unimported lib module this file does not account for', () => {
    const undeclared = parkedModules.filter((m) => !(m in KNOWN_PARKED_MODULES));
    expect(
      undeclared,
      'This module is imported by nothing but its own test. Either wire it, delete it, or declare here WHY it is parked and what has to happen before it is wired. An undeclared one is a second authority nobody knows is waiting:\n  ' +
        undeclared.join('\n  '),
    ).toEqual([]);
  });

  it('lists nothing that is now wired', () => {
    const stale = Object.keys(KNOWN_PARKED_MODULES).filter((k) => !parkedModules.includes(k));
    expect(stale, `wired now — remove from KNOWN_PARKED_MODULES:\n  ${stale.join('\n  ')}`).toEqual([]);
  });

  it('gives every parked module a reason and a way out', () => {
    for (const [path, reason] of Object.entries(KNOWN_PARKED_MODULES)) {
      expect(reason.length, `${path} needs a real reason`).toBeGreaterThan(80);
      expect(/PARKED|KEEP|MIGRATION-BLOCKED/.test(reason), `${path} must carry an explicit status`).toBe(true);
    }
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
