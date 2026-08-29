import { describe, it, expect } from 'vitest';
import { classifyObjective, OBJECTIVE_LABEL } from './sales-objective';
import type { DueReason } from './call-queue';

const input = (over: Partial<Parameters<typeof classifyObjective>[0]> = {}) => ({
  lane: 'fresh' as DueReason, hasCommercialSignal: false, hasRetentionNeed: false, ...over,
});

describe('classifyObjective', () => {
  it('a live commercial signal takes the primary slot — it expires, retention need does not', () => {
    const v = classifyObjective(input({ lane: 'going_cold', hasCommercialSignal: true, hasRetentionNeed: true }));
    expect(v.primary).toBe('conversion');
    expect(v.secondary).toBe('retention');
    expect(v.primaryReason).toContain('expires');
  });

  // The whole point of one card: a student in both states is ONE call.
  it('never produces two objectives without naming which is primary', () => {
    const v = classifyObjective(input({ lane: 'conversion', hasCommercialSignal: true, hasRetentionNeed: true }));
    expect(v.primary).toBeTruthy();
    expect(v.secondary).not.toBe(v.primary);
  });

  it('a retention lane with no money signal is a retention call', () => {
    for (const lane of ['going_cold', 'broken_streak'] as DueReason[]) {
      const v = classifyObjective(input({ lane, hasRetentionNeed: true }));
      expect(v.primary).toBe('retention');
      expect(v.secondary).toBeNull();
    }
  });

  // 737 of 975 students have never logged. If activation were a conversion
  // lane, both counsellors would open with a pitch for three-quarters of the
  // base — the wrong conversation at the worst possible moment.
  it('activation is retention, not conversion', () => {
    const v = classifyObjective(input({ lane: 'new_never_logged', hasRetentionNeed: true }));
    expect(v.primary).toBe('retention');
    expect(v.primaryReason).toContain('never started');
  });

  it('the student reaching for the paid option themselves is a conversion call', () => {
    const v = classifyObjective(input({ lane: 'conversion' }));
    expect(v.primary).toBe('conversion');
    expect(v.primaryReason).toContain('themselves');
  });

  // Opening with an offer to somebody who has simply gone quiet is how a
  // helpful call becomes a sales call.
  it('a quiet student with no money signal gets a retention call, not a pitch', () => {
    const v = classifyObjective(input({ lane: 'callback', hasRetentionNeed: true }));
    expect(v.primary).toBe('retention');
  });

  it('every verdict carries a non-empty reason — a card whose purpose we cannot state is not dealt', () => {
    const lanes: DueReason[] = ['callback', 'retry', 'followup', 'going_cold', 'broken_streak', 'new_never_logged', 'conversion', 'fresh'];
    for (const lane of lanes) {
      for (const money of [true, false]) {
        for (const need of [true, false]) {
          const v = classifyObjective({ lane, hasCommercialSignal: money, hasRetentionNeed: need });
          expect(v.primaryReason.length, `${lane}/${money}/${need} has no reason`).toBeGreaterThan(10);
          expect(['retention', 'conversion']).toContain(v.primary);
        }
      }
    }
  });

  it('labels are two words, never sentences', () => {
    expect(OBJECTIVE_LABEL.retention).toBe('Retention');
    expect(OBJECTIVE_LABEL.conversion).toBe('Conversion');
  });
});

// ── Guards: the card must actually carry both, or none of this matters ──────
import fs from 'node:fs';
const read = (f: string) => fs.readFileSync(f, 'utf-8');

describe('the card carries what the counsellor needs before dialling', () => {
  it('every queue card is labelled with its business goal', () => {
    const q = read('src/lib/call-queue.ts');
    expect(q, 'the queue must classify the objective').toMatch(/classifyObjective\s*\(/);
    const d = read('src/components/call-deck.tsx');
    expect(d, 'and the card must show it').toMatch(/lead\.objective/);
  });

  it('the last interaction is on the card, not one tap deeper', () => {
    const q = read('src/lib/call-queue.ts');
    expect(q, 'the queue must read prior interactions').toMatch(/from\('sales_activity'\)[\s\S]{0,200}created_at/);
    const d = read('src/components/call-deck.tsx');
    // Checking for the identifier alone was too weak — wrapping the block in
    // `{false && …}` left it matching. The guard now requires the branch to be
    // driven by the value AND the student's actual words to be rendered.
    expect(d, "a counsellor who has to open another screen will stop doing it")
      .toMatch(/\{lead\.lastInteraction && \(/);
    expect(d, "the student's own words are the point, not the timestamp")
      .toMatch(/lead\.lastInteraction\.note/);
  });

  it('the most recent interaction wins — older rows are ignored, not overwritten', () => {
    const q = read('src/lib/call-queue.ts');
    expect(q).toMatch(/ascending: false/);
    expect(q, 'first row seen per student is the newest').toMatch(/if \(lastBy\.has\(a\.student_id\)\) continue;/);
  });
});
