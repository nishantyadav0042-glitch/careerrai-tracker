import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── The admin Capacity Engine card may only claim what the product does ─────
//
// The card used to render "plan sized to {sustainableHours}h" in a coloured
// badge. That sentence was false. `capBudget()` — the ONLY function that
// applies sustainableHours to a proposed plan — has never had a caller, and
// plans are actually sized by `dailyHours(profile)` (plan-day.ts). So the
// founder was reading a number that described nothing, on the screen used to
// judge students.
//
// This guard is written as a TWO-WAY COUPLING rather than a flat ban, because
// the claim is not permanently wrong — it is wrong *while nothing consumes the
// value*. If someone legitimately wires capBudget into plan sizing, the claim
// becomes true and should be allowed back. Asserting "the text must never
// exist" would then fail for the wrong reason and invite deletion of the test.
//
// THE INVARIANT: the admin surface may state that capacity sizes the plan
// only if capacity actually sizes the plan.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const ADMIN = 'src/app/admin/student/[id]/page.tsx';
const ENGINE = 'src/lib/capacity-engine.ts';

/** Non-test, non-definition callers of capBudget across the source tree. */
function capBudgetIsWired(): boolean {
  const engine = read(ENGINE);
  // Its own definition never counts as a caller.
  const defLine = /export function capBudget\(/;
  const engineCalls = engine
    .split('\n')
    .filter((l) => /\bcapBudget\s*\(/.test(l) && !defLine.test(l));
  return engineCalls.length > 0;
}

describe('the admin capacity card cannot claim what the product does not do', () => {
  it('capBudget still has no caller — recorded so the claim stays testable', () => {
    // If this ever fails, capacity may genuinely size plans now. That is not a
    // bug: revisit the badge below, do not weaken this test.
    expect(capBudgetIsWired(), 'capBudget gained a caller — re-evaluate the admin claim').toBe(false);
  });

  it('the false "plan sized to" claim is gone while nothing consumes capacity', () => {
    const admin = read(ADMIN);
    if (!capBudgetIsWired()) {
      expect(admin, 'the plan is sized by dailyHours(profile), not by capacity')
        .not.toMatch(/plan sized to/i);
    }
  });

  it('the capacity reading itself is still surfaced — this removes a claim, not information', () => {
    // Deliberately narrow: the founder loses a false sentence, not the engine's
    // output. claimedHours, typicalStudyHours, the trust colour on the card and
    // the engine's own note all survive.
    const admin = read(ADMIN);
    expect(admin, 'entered hours must still show').toMatch(/entered \{s\.capacity\.claimedHours/);
    expect(admin, 'observed typical hours must still show').toContain('typicalStudyHours');
    expect(admin, 'the trust signal must still colour the card').toMatch(/s\.capacity\.trust === 'behaviour'/);
    expect(admin, "the engine's own explanation must still render").toContain('s.capacity.note');
  });

  it('plan sizing itself is untouched', () => {
    // Scope guard: this gate is a UI truthfulness fix and must not become a
    // capacity-model change.
    expect(read('src/lib/plan-day.ts'), 'the day is still sized by the profile hours')
      .toMatch(/const hours = dailyHours\(profile\)/);
    const engine = read(ENGINE);
    expect(engine, 'capBudget itself must not be deleted — it is the intended future wiring')
      .toContain('export function capBudget(');
  });
});
