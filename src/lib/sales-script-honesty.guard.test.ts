import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── Outbound sales copy may only promise what a student can receive ──
//
// Found 13 Aug 2026 while building the Pooja training manual — the generated
// queue script carried two claims that did not survive a check against the
// live system. Re-found 20 Aug by the Sales Phase-1 forensic: the SAME claims
// were alive in two files this guard did not cover, because it was pinned to
// one filename. Four real students had already received the free-messages
// promise via Tonight's Mission (26 grants recorded, 0 ever activated).
//
// The guard now encodes the IDEA across every file that generates outbound
// sales copy, not a character sequence in one file:
//
//   1. No free-message/free-question offer — the mechanic is dormant by
//      design (env flag + per-grant admin activation, mentor-doors.ts).
//      mentor-doors.ts itself is deliberately NOT in this list: its copy is
//      generated only AFTER a grant is activated, when the messages are real.
//   2. No unconditional "no risk" framing.
//   3. The refund is never stated without its logged-study-days condition
//      (the public /refunds page requires it).
//   4. One file quotes at most one price — a lead hearing two numbers from
//      the same script is the claim-vs-delivery gap in a different costume.
//
// Add any new outbound-copy module to FILES the day it is created.

const FILES = [
  'src/lib/sales-queue.ts', // the queue's ready-to-send script
  'src/lib/sales-conversion.ts', // the objection playbook read DURING a call
  'src/lib/mission-queue.ts', // Tonight's Mission founder WhatsApp drafts
  'src/lib/wa-messages.ts', // the WhatsApp copy library
];
const src = (f: string) => readFileSync(f, 'utf8');

describe.each(FILES)('outbound sales copy honesty: %s', (file) => {
  it('never offers the dormant free-message mechanic', () => {
    // Lookbehind excludes hyphenated words like "state-free message"
    // (a code comment, not copy) while catching every real phrasing.
    expect(src(file)).not.toMatch(/(?<!-)free\s+(message|msg|question)/i);
  });

  it('does not pull the free-message count constant into the sales path', () => {
    expect(src(file)).not.toContain('MENTOR_FREE_MESSAGES');
  });

  it('drops the unconditional "no risk" framing', () => {
    expect(src(file)).not.toMatch(/no risk/i);
  });

  it('states the logged-days condition wherever the refund is mentioned', () => {
    const s = src(file);
    if (/full refund/i.test(s)) {
      expect(s).toMatch(/20 logged study days/);
    }
  });

  it('quotes a single price, not two competing ones', () => {
    // Conflict 1 in docs/POOJA-TRAINING-MANUAL.md (which plan leads) is an
    // open founder decision — until it is ruled, no file may quietly acquire
    // BOTH numbers.
    // Trailing punctuation is not part of the price ("Rs 999," ≡ "Rs 999").
    const quoted = (src(file).match(/Rs [\d,]+/g) ?? []).map((p) => p.replace(/,+$/, ''));
    expect(new Set(quoted).size).toBeLessThanOrEqual(1);
  });
});
