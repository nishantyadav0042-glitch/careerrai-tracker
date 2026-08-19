import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── One "completion %", not two (P0-C-B/C, re-cut) ─────────────────────────
//
// computeRequiredPace measured completion by HOURS of work. The Home ring shows
// completion by COVERAGE. Both were called `completedPct`, and both lived on the
// same returned object -- the Metric Constitution's one-meaning-one-fact rule
// broken inside a single type.
//
// No student ever saw the wrong one: tracker/page.tsx already discarded the
// hours figure and substituted completedByTopics. That is exactly what made it
// dangerous. The producer sat there, correct-looking and unused, so any new
// caller reading `computeRequiredPace(...).completedPct` would have got the
// other meaning and silently disagreed with the ring -- the same dormant-second-
// authority shape as the retired `portion` column.
//
// The parked P0-C-B/C removed it on 18 Aug and never merged; its guard was
// absent from main while study-pace.ts was present, so the file looked fixed
// and was not.
//
// The percentage is now supplied BY THE CALLER at the PaceCard boundary, where
// it has to be named and therefore chosen.

const ROOT = process.cwd();
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8');
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

describe('completion percentage has exactly one producer', () => {
  it('study-pace does not return a completion percentage', () => {
    const s = code('src/lib/study-pace.ts');
    expect(s, 'computeRequiredPace measures hours, not coverage').not.toMatch(/completedPct/);
  });

  it('the ring is fed a coverage figure by its caller', () => {
    const s = code('src/app/student/tracker/page.tsx');
    expect(s).toMatch(/completedPct:\s*completedByTopics/);
    expect(s, 'and it is computed from topics, not hours').toMatch(/completedByTopics\s*=/);
  });

  it('the card declares that the caller supplies it', () => {
    const s = code('src/components/home/pace-card.tsx');
    expect(s, 'the extra field must be explicit at the boundary')
      .toMatch(/PaceResult\s*&\s*\{\s*completedPct/);
  });

  it('still renders the percentage — the fix is not a deletion of the ring', () => {
    const s = code('src/components/home/pace-card.tsx');
    expect(s).toMatch(/pace\.completedPct/);
  });
});
