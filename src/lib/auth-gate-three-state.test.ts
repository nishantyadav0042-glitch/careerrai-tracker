import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── TRUE / FALSE / UNKNOWN, proven by driving the real gates ───────────────
//
// Founder's proof #1: force the role read to fail, then verify the person is
// neither treated as some role NOR silently let in. The guard next door reads
// source text; this drives the ACTUAL functions with a client whose read
// errors, because a static check cannot tell you what happens at runtime.
//
// Why the third state matters here specifically: buddy/layout.tsx held the
// same broken read pointing both ways at once — the slow path denied a real
// buddy, the cookie path let an unknown user through. Retrying is not enough
// when a failure can produce either wrong answer. UNKNOWN has to be its own
// outcome, and it has to be loud.

const redirect = vi.fn((to: string) => { throw new Error(`REDIRECT:${to}`); });
vi.mock('next/navigation', () => ({ redirect: (to: string) => redirect(to) }));

const getAuthUser = vi.fn();
vi.mock('@/lib/auth', () => ({ getAuthUser: () => getAuthUser() }));

const createAdminClient = vi.fn();
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => createAdminClient() }));

const { requireAdmin, requireBuddy, requireSales, readRole, homeForRole } =
  await import('./admin-auth');

/** A profiles client whose single() answers however the test wants. */
function clientThat(answer: () => { data: unknown; error: unknown }) {
  const chain = { select: () => chain, eq: () => chain, single: async () => answer() };
  return { from: () => chain } as never;
}
const ok = (role: string | null) => () => ({ data: role ? { role } : null, error: null });
const fails = () => ({ data: null, error: { message: 'connection reset' } });

beforeEach(() => {
  redirect.mockClear();
  getAuthUser.mockResolvedValue({ id: 'u1' });
});

describe('UNKNOWN is its own outcome, and it is loud', () => {
  it.each([
    ['requireAdmin', requireAdmin],
    ['requireBuddy', requireBuddy],
    ['requireSales', requireSales],
  ])('%s throws when the role cannot be read — it never decides', async (_n, gate) => {
    createAdminClient.mockReturnValue(clientThat(fails));
    await expect(gate()).rejects.toThrow(/could not verify|verify admin access/i);
    // The whole point: it must NOT have quietly sent them anywhere, and it
    // must NOT have returned a client as if access were granted.
    expect(redirect, 'a failed read must never become a redirect').not.toHaveBeenCalled();
  });

  it('retries once before giving up, so a single blip is invisible', async () => {
    let call = 0;
    const chain = {
      select: () => chain, eq: () => chain,
      single: async () => (++call === 1 ? fails() : { data: { role: 'admin' }, error: null }),
    };
    createAdminClient.mockReturnValue({ from: () => chain } as never);
    await expect(requireAdmin()).resolves.toMatchObject({ user: { id: 'u1' } });
    expect(call, 'should have retried exactly once').toBe(2);
  });
});

describe('TRUE lets the right person through', () => {
  it.each([
    ['admin', requireAdmin],
    ['buddy', requireBuddy],
    ['sales', requireSales],
  ])('%s passes its own role', async (role, gate) => {
    createAdminClient.mockReturnValue(clientThat(ok(role)));
    await expect(gate()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });

  it('an admin also passes the sales door', async () => {
    createAdminClient.mockReturnValue(clientThat(ok('admin')));
    await expect(requireSales()).resolves.toBeTruthy();
    expect(redirect).not.toHaveBeenCalled();
  });
});

describe('FALSE sends them home, not to the login screen', () => {
  it.each([
    ['student at the admin door', 'student', requireAdmin, '/student/tracker'],
    ['buddy at the admin door', 'buddy', requireAdmin, '/buddy/home'],
    ['student at the buddy door', 'student', requireBuddy, '/student/tracker'],
    ['admin at the buddy door', 'admin', requireBuddy, '/admin'],
    ['student at the sales door', 'student', requireSales, '/student/tracker'],
  ])('%s → %s', async (_label, role, gate, dest) => {
    createAdminClient.mockReturnValue(clientThat(ok(role as string)));
    await expect((gate as () => Promise<unknown>)()).rejects.toThrow(`REDIRECT:${dest}`);
  });

  it('only a role we genuinely could not identify goes to /login', async () => {
    createAdminClient.mockReturnValue(clientThat(ok(null)));
    await expect(requireAdmin()).rejects.toThrow('REDIRECT:/login');
    expect(homeForRole(null)).toBe('/login');
  });
});

describe('the primitive itself', () => {
  it('reports the role it read, and null for a row with no role', async () => {
    await expect(readRole(clientThat(ok('admin')), 'u1')).resolves.toBe('admin');
    await expect(readRole(clientThat(ok(null)), 'u1')).resolves.toBeNull();
  });

  it('throws rather than returning null when the read failed', async () => {
    // Returning null here is the entire bug: null is indistinguishable from
    // "this account has no role", and every caller then decides against them.
    await expect(readRole(clientThat(fails), 'u1')).rejects.toThrow();
  });
});
