import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── B3b gate 1 — no unbounded population read in a mutation-capable path ────
//
// On 23 Aug 2026 `weekly-plan-reconcile` sent 739 student ids in one PostgREST
// request. It returned nothing usable, `?? []` turned that into an empty week
// for every student, and the job moved 3,690 days of syllabus dates while
// reporting `{"ok": true}`. 57 of those students had studied 277.9 hours.
//
// The failure was a STEP CHANGE, not a slope: 263 students fine, 428 fine, 739
// total failure. Nothing warned in between, which is exactly why a guard is the
// only thing that helps — there is no gradual signal to watch for.
//
// ── WHAT THIS GUARD PINS ───────────────────────────────────────────────────
//
// The IDEA: a request whose size grows with the student base, feeding a path
// that can change student-facing state.
//
// Not the mechanism. The 24 KB PostgREST hypothesis is BRACKETED, NOT PROVEN
// (~19.3 KB of ids worked, ~33.3 KB failed) — see
// docs/RECONCILE-RECOVERY-CLASSIFICATION.md §1. A guard written against a byte
// count would encode a number nobody has measured, and would miss the next
// transport that fails at a different one. So it pins the SHAPE.
//
// ── THE BASELINE SHRINKS, NEVER GROWS ──────────────────────────────────────
//
// 13 known offenders are listed. The test fails if a NEW one appears, and also
// fails if the list is stale — a migrated file left in the baseline would
// quietly re-permit the pattern later. Gate 10 of the B3b mandate: prove the
// count actually fell rather than moved into a helper that hides it.

const ROOT = process.cwd();
const SRC = join(ROOT, 'src');

/** Reads bounded by chunk rather than by population. The authorised way. */
const BOUNDED = /readRowsForIds|chunkIds/;

/** Writes student-facing state directly. */
const DIRECT_MUTATION = /\.(update|insert|upsert|delete)\(|\.rpc\(/;

/**
 * Writes it through a helper. A push notification IS student-facing state —
 * the first draft of this guard missed daily-reminder and study-companion
 * because neither contains a write verb of its own, and both can notify the
 * entire cohort off a single unchecked read.
 */
const HELPER_MUTATION =
  /\bdispatch\(|sendSecurityAlert|sendDailyReminder|mutatePlanTasks|applyTimetable|sendBuddy|sendEmail|sendWhatsApp/;

/** `.in('col', someIdsVariable)` — a list, not a literal set of enum values. */
const POPULATION_IN = /\.in\(\s*['"]\w+['"]\s*,\s*([A-Za-z_$][\w$.[\]]*)\s*\)/g;

/**
 * Known offenders as of 23 Aug 2026, each still to be migrated. REMOVE an entry
 * when the file is migrated; never add one to make a build pass.
 */
const KNOWN_UNBOUNDED: readonly string[] = [
  'src/app/api/admin/expedify-followups/route.ts',
  'src/app/api/cron/buddy-brief/route.ts',
  'src/app/api/cron/builder-recovery/route.ts',
  'src/app/api/cron/check-red-flags/route.ts',
  'src/app/api/cron/daily-reminder/route.ts',
  'src/app/api/cron/decision-engine/route.ts',
  'src/app/api/cron/expire-subscriptions/route.ts',
  'src/app/api/cron/founder-alerts/route.ts',
  'src/app/api/cron/nishant-weekly/route.ts',
  'src/app/api/cron/onboarding-morning/route.ts',
  'src/app/api/cron/sales-ready/route.ts',
  'src/app/api/cron/study-companion/route.ts',
  'src/app/api/cron/weekly-digest/route.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    if (e === 'node_modules' || e === '.next') continue;
    const full = join(dir, e);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(full);
  }
  return out;
}

/** Strip comments, so a file EXPLAINING the pattern is not accused of it. */
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

function offenders(): string[] {
  const found: string[] = [];
  for (const abs of walk(SRC)) {
    const path = abs.slice(ROOT.length + 1).replace(/\\/g, '/');
    const code = strip(readFileSync(abs, 'utf8'));

    const ids = [...code.matchAll(POPULATION_IN)]
      .map((m) => m[1])
      .filter((v) => /ids|Ids|IDS/.test(v));
    if (ids.length === 0) continue;
    if (BOUNDED.test(code)) continue;
    if (!(DIRECT_MUTATION.test(code) || HELPER_MUTATION.test(code))) continue;

    found.push(path);
  }
  return found.sort();
}

describe('B3b gate 1 — population-scaled reads in mutation-capable paths', () => {
  it('finds the pattern at all (the guard is not vacuous)', () => {
    // If the regexes rot, every case below passes for the wrong reason.
    expect(offenders().length).toBeGreaterThan(0);
  });

  it('no NEW unbounded population read reaches a mutation', () => {
    const novel = offenders().filter((f) => !KNOWN_UNBOUNDED.includes(f));
    expect(
      novel,
      'A path that can change student state reads the whole population in one\n' +
      'request. Read it through readRowsForIds (bounded by chunk, all-or-nothing\n' +
      'across chunks) and gate the mutation on source validity.\n' +
      'Do NOT add it to KNOWN_UNBOUNDED to make this pass.\n' + novel.join('\n'),
    ).toEqual([]);
  });

  it('the baseline is not stale — migrated files must leave the list', () => {
    const current = offenders();
    const fixedButStillListed = KNOWN_UNBOUNDED.filter((f) => !current.includes(f));
    expect(
      fixedButStillListed,
      'These are migrated (or deleted) but still in KNOWN_UNBOUNDED. Remove them —\n' +
      'a stale entry silently re-permits the pattern in that file later.\n' +
      fixedButStillListed.join('\n'),
    ).toEqual([]);
  });

  it('the count only ever falls', () => {
    // Gate 10: prove the population-scaled read count actually dropped, rather
    // than moving into a helper that hides it.
    expect(offenders().length).toBeLessThanOrEqual(KNOWN_UNBOUNDED.length);
  });

  it('weekly-plan-reconcile stays migrated — the incident does not come back', () => {
    const code = strip(
      readFileSync(join(SRC, 'app/api/cron/weekly-plan-reconcile/route.ts'), 'utf8'));
    expect(BOUNDED.test(code), 'the reconciliation must read through readRowsForIds').toBe(true);
    expect(/gateOnSource/.test(code), 'its mutation must be gated on source validity').toBe(true);
    expect(offenders()).not.toContain('src/app/api/cron/weekly-plan-reconcile/route.ts');
  });
});
