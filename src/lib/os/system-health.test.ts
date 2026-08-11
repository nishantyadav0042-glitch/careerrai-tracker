import { describe, it, expect } from 'vitest';
import { assembleSystemHealth } from './system-health';

// A tiny fake admin: enough shape for the assembler to run against controlled
// data. business_invariants is an RPC; the sacred guard reads a couple of
// tables. Both sacred sources are left empty here so the tests isolate the
// invariant/engine behaviour — the sacred guard has its own tests.
type InvariantRow = Record<string, unknown>;
function fakeAdmin(invariants: { data: InvariantRow[] | null; error: { message: string } | null }) {
  return {
    rpc: async (name: string) => (name === 'business_invariants' ? invariants : { data: [], error: null }),
    from() {
      // A self-returning query builder: every chained method hands back the
      // same object, and awaiting it resolves to an empty result set.
      const builder: Record<string, unknown> & { then: (r: (v: { data: InvariantRow[] }) => void) => void } = {
        select() { return builder; },
        eq() { return builder; },
        is() { return builder; },
        not() { return builder; },
        lt() { return builder; },
        in() { return builder; },
        then(resolve: (v: { data: InvariantRow[] }) => void) { resolve({ data: [] }); },
      };
      return builder;
    },
  } as unknown as Parameters<typeof assembleSystemHealth>[0];
}

describe('System Health surfaces only what is broken', () => {
  it('is all-clear when no invariant is breached and nothing is sacred-broken', async () => {
    const admin = fakeAdmin({ data: [{ capability: 'Payment', tier: 0, invariant: 'no_paid_without_premium', violations: 0 }], error: null });
    const h = await assembleSystemHealth(admin, Date.now());
    expect(h.allClear).toBe(true);
    expect(h.items).toHaveLength(0);
    expect(h.invariantsChecked).toBe(1);
  });

  it('surfaces a breached invariant, tier 0 as critical', async () => {
    const admin = fakeAdmin({ data: [{ capability: 'Payment', tier: 0, invariant: 'no_paid_without_premium', violations: 3 }], error: null });
    const h = await assembleSystemHealth(admin, Date.now());
    expect(h.allClear).toBe(false);
    expect(h.items[0].severity).toBe('critical');
    expect(h.items[0].count).toBe(3);
    expect(h.items[0].source).toBe('invariant');
  });

  it('a dead integrity engine is itself a critical health item', async () => {
    const admin = fakeAdmin({ data: null, error: { message: 'rpc missing' } });
    const h = await assembleSystemHealth(admin, Date.now());
    expect(h.allClear).toBe(false);
    expect(h.items[0].id).toBe('engine:down');
    expect(h.items[0].severity).toBe('critical');
  });

  it('ranks critical before normal', async () => {
    const admin = fakeAdmin({ data: [
      { capability: 'Streak', tier: 2, invariant: 'streak_monotonic', violations: 1 },
      { capability: 'Payment', tier: 0, invariant: 'no_paid_without_premium', violations: 1 },
    ], error: null });
    const h = await assembleSystemHealth(admin, Date.now());
    expect(h.items[0].severity).toBe('critical');
    expect(h.items[1].severity).toBe('normal');
  });
});
