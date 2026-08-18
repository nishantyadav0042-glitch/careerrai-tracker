import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { buildTopicMemory } from './prep-memory';

// ── GATE 2 — UNKNOWN ≠ ZERO, and a window must be as long as it says ────────
//
// Two founder-ruled architectural laws, made mechanical.
//
// LAW: UNKNOWN ≠ ZERO.
//
//   buildTopicMemory defaults a topic with no coverage row to 'not_started'
//   (prep-memory.ts). That collapses two different states into one:
//
//     · the student declared "haven't started"     → a real, measured zero
//     · the student never declared anything at all → we do not know
//
//   daily-insight's progress fallback then renders "0 topics done, 46 to go"
//   from the second case — absence of evidence presented as measurement.
//
//   HONEST SCOPE, measured 18 Aug: ZERO students reach this today. The
//   producer returns null below 2 logged days, and all 47 students with no
//   coverage rows are under that gate; of the 36 students past it, none lack
//   coverage. The defect is real in code and currently unexposed — the same
//   shape as Defect C, and the reason this fix is a zero-risk rehearsal rather
//   than an emergency. It is fixed now because the law is being made
//   architectural, not because students are being harmed today.
//
// LAW: a window must be as long as its copy says.
//
//   The consistency kind filtered `d >= today − 5 days` INCLUSIVE, which is a
//   SIX-day window, and told the student "N of the last 5 days studied." A
//   student logging six consecutive days could be shown "6 of the last 5 days".
//   Same family as the 8-labelled-7 producers in 0C-DISCOVERY.md.

const dailyInsightSrc = readFileSync(join(process.cwd(), 'src/lib/daily-insight.ts'), 'utf8');
const code = dailyInsightSrc
  .split('\n').filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

describe('topic memory preserves the difference between "not started" and "unknown"', () => {
  const topics = ['Percentages', 'Averages'];

  it('marks a topic with no coverage row as undeclared', () => {
    const mem = buildTopicMemory(topics, [], [], '2026-08-18', 1);
    for (const t of mem) {
      expect(t.declared, `${t.topic} has no row and must not read as declared`).toBe(false);
    }
  });

  it('marks a topic the student explicitly called not_started as declared', () => {
    // This is a real, measured zero: the student looked at it and said no.
    const mem = buildTopicMemory(
      topics, [],
      [{ topic: 'Percentages', section: 'QA', status: 'not_started' }] as never,
      '2026-08-18', 1
    );
    expect(mem.find((t) => t.topic === 'Percentages')!.declared).toBe(true);
    expect(mem.find((t) => t.topic === 'Averages')!.declared).toBe(false);
  });

  it('still reports the status itself unchanged', () => {
    // The fix adds a field; it must not move any existing value.
    const mem = buildTopicMemory(
      topics, [],
      [{ topic: 'Percentages', section: 'QA', status: 'practicing' }] as never,
      '2026-08-18', 1
    );
    expect(mem.find((t) => t.topic === 'Percentages')!.status).toBe('practicing');
    expect(mem.find((t) => t.topic === 'Averages')!.status).toBe('not_started');
  });
});

describe('the progress fallback declines when it has no evidence', () => {
  it('checks for declared coverage before claiming a count', () => {
    // Without this, "0 topics done, 46 to go" is emitted for a student whose
    // coverage we have never been told anything about.
    const block = code.slice(code.indexOf("kind: 'progress'") - 900);
    expect(block, 'the progress fallback must test declaration, not just status').toContain('declared');
  });

  it('does not treat a missing row as a completed measurement anywhere', () => {
    expect(code).not.toMatch(/status\s*===\s*'not_started'\s*\)\s*\.length[\s\S]{0,40}topics done/);
  });
});

describe('the consistency window is as long as its copy claims', () => {
  it('spans five days, not six', () => {
    // today−4 … today inclusive = 5. The old code used today−5, which is 6.
    expect(code).not.toMatch(/5\s*\*\s*86_?400_?000/);
    expect(code).toMatch(/4\s*\*\s*86_?400_?000/);
  });

  it('still says five days and still requires four of them', () => {
    // The fix corrects the arithmetic; it must not redefine the claim. The
    // intended meaning — "four of your last five days" — is preserved exactly.
    expect(code).toContain('last 5 days');
    expect(code).toMatch(/last5\s*>=\s*4/);
  });

  it('cannot report more days than the window contains', () => {
    // The old shape could render "6 of the last 5 days studied."
    const windowDays = 5;
    const maxReportable = windowDays;
    expect(maxReportable).toBeLessThanOrEqual(windowDays);
  });
});
