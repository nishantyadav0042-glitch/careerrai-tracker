import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Nothing the founder sent gets quietly dropped ─────────────────────────
//
// Founder, 31 Aug: "just consume all the inputs without a single word miss."
//
// He was right to say it. The round-2 log had kept six of the eleven fields
// each Gemini response carried, and one of the five it dropped was WORKED
// QUESTIONS SOLVED — the sufficiency test he had set himself: if the task says
// solve fifteen questions, the link has to actually contain them. Dropping it
// removed the only evidence for the judgement he cares most about, and nothing
// in the repo would have noticed.
//
// docs/phase0/GEMINI-RESPONSES-VERBATIM.md is now the primary source, and
// RESPONSES-COMPLETE.json its structured index. These tests keep the second
// honest about the first.

const VERBATIM = 'docs/phase0/GEMINI-RESPONSES-VERBATIM.md';
const RECORD = 'docs/phase0/RESPONSES-COMPLETE.json';

const verbatim = () => readFileSync(VERBATIM, 'utf8');
const record = () => JSON.parse(readFileSync(RECORD, 'utf8'));

// The placeholder Gemini emitted in place of a URL it would not confirm. It
// looks like an id and is not one.
const PLACEHOLDER = 'NOT_CONFIRM';

function idsIn(text: string): Set<string> {
  const out = new Set<string>();
  for (const m of text.matchAll(/(?:watch\?v=|youtu\.be\/|\/embed\/)([A-Za-z0-9_-]{11})/g)) {
    if (!m[1].startsWith(PLACEHOLDER)) out.add(m[1]);
  }
  return out;
}

describe('the structured record loses nothing from the verbatim archive', () => {
  it('indexes every video id the founder actually pasted', () => {
    const inArchive = idsIn(verbatim());
    const indexed = new Set(
      (record().blocks as { video_id?: string }[]).map((b) => b.video_id).filter(Boolean) as string[],
    );
    const missing = [...inArchive].filter((v) => !indexed.has(v));
    expect(missing, `ids present in the archive but absent from the record: ${missing.join(', ')}`).toEqual([]);
  });

  it('keeps the fields the earlier logs dropped', () => {
    // Each of these was in every response and in none of the round-2 rows.
    const blocks = record().blocks as Record<string, unknown>[];
    const has = (k: string) => blocks.filter((b) => b[k] !== undefined).length;
    expect(has('worked_questions'), 'the sufficiency test').toBeGreaterThan(100);
    expect(has('paid_push'), 'a TRUST-OS reject condition').toBeGreaterThan(100);
    expect(has('watched'), 'whether Gemini claims it watched at all').toBeGreaterThan(100);
    expect(has('difficulty'), 'the evidence behind the ladder level').toBeGreaterThan(100);
    expect(has('why'), "the reasoning, which is what a human re-grader reads").toBeGreaterThan(100);
  });

  it('attributes every block to a topic', () => {
    // A block with no topic is a resource that can never be looked up, which
    // is the same as having lost it.
    const orphans = (record().blocks as { topic?: string }[]).filter((b) => !b.topic);
    expect(orphans.length).toBe(0);
  });

  it('never presents the claims as verified', () => {
    // The whole file is Gemini's word. Nine of its videos did not exist.
    // Whoever reads this next must not be able to mistake it for an audit.
    expect(record().warning).toMatch(/CLAIMS/);
    expect(verbatim()).toMatch(/claims, not facts/i);
  });
});
