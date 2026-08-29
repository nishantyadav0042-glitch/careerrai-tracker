import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ensureTransactableOrigin } from './checkout-origin-guard';

// The failure modes here are asymmetric and the tests are written around that.
//
// A hand-off that does not happen leaves the student exactly where they are
// today: they meet a Razorpay block, which is bad but visible. A hand-off that
// reports `move: true` without navigating leaves them on a button that did
// nothing at all, which is worse — the caller returns and nothing happens ever.
// So every failure path must resolve to `move: false`.

const LEGACY = 'https://careerrai-daily.vercel.app';
const CANON  = 'https://careerrai.in';

let assigned: string | null = null;
function setOrigin(origin: string) {
  assigned = null;
  vi.stubGlobal('window', {
    location: { origin, assign: (u: string) => { assigned = u; } },
  });
}

beforeEach(() => { vi.unstubAllGlobals(); assigned = null; });
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe('ensureTransactableOrigin', () => {
  it('does nothing at all on the canonical origin — no network call', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
    setOrigin(CANON);
    expect(await ensureTransactableOrigin('buddy')).toEqual({ move: false });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(assigned).toBeNull();
  });

  it('mints a hand-off and navigates to the checkout origin on the legacy one', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ url: '/app?k=TOKEN123' }) })));
    setOrigin(LEGACY);
    expect(await ensureTransactableOrigin('buddy')).toEqual({ move: true });
    const u = new URL(assigned!);
    expect(u.origin).toBe(CANON);
    expect(u.pathname).toBe('/pay/continue');
    expect(u.searchParams.get('k')).toBe('TOKEN123');
    expect(u.searchParams.get('to')).toBe('buddy');
  });

  it('falls through to the existing checkout when the hand-off API refuses', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));
    setOrigin(LEGACY);
    expect(await ensureTransactableOrigin('buddy')).toEqual({ move: false });
    expect(assigned).toBeNull();
  });

  it('falls through when the hand-off response carries no token', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ url: '/app' }) })));
    setOrigin(LEGACY);
    expect(await ensureTransactableOrigin('buddy')).toEqual({ move: false });
    expect(assigned).toBeNull();
  });

  it('falls through when the network throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline'); }));
    setOrigin(LEGACY);
    expect(await ensureTransactableOrigin('buddy')).toEqual({ move: false });
    expect(assigned).toBeNull();
  });

  it('never claims to have moved without having navigated', async () => {
    // The invariant that protects the callers, which all `return` on move.
    for (const f of [
      vi.fn(async () => ({ ok: false, json: async () => ({}) })),
      vi.fn(async () => ({ ok: true, json: async () => ({}) })),
      vi.fn(async () => { throw new Error('x'); }),
    ]) {
      vi.stubGlobal('fetch', f);
      setOrigin(LEGACY);
      const r = await ensureTransactableOrigin('profile');
      expect(r.move === true).toBe(assigned !== null);
    }
  });
});
