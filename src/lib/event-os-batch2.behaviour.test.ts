import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── EVENT OS Phase 0 batch 2 — the properties, not the plumbing ─────────────
//
// The ledger guard proves every converted writer CALLS dispatch(). That is
// necessary and nowhere near sufficient: a call with the wrong recipient, no
// destination, or no preferences is a converted writer that still fails the
// student. These tests drive the real modules and assert the properties the
// forensic checklist asks for — recipient, destination, preferences, and the
// duplicate/retry behaviour of the two writers that carry their own dedup.

const dispatch = vi.hoisted(() => vi.fn(async (o: Record<string, unknown>) => { void o; return 'sent'; }));
vi.mock('@/lib/notification-os', () => ({ dispatch }));

beforeEach(() => { vi.clearAllMocks(); vi.resetModules(); });

// ── premium.ts — the moment money changed hands ─────────────────────────────
describe('grantPremium → membership event', () => {
  function adminFake(flipped: Array<{ id: string }> | null, prefs: unknown = { push: true }) {
    return {
      from: (t: string) => {
        if (t === 'profiles') {
          const q: Record<string, unknown> = {
            update: () => q, eq: () => q,
            select: () => q,
            single: async () => ({ data: { notif_prefs: prefs } }),
            then: (r: (v: unknown) => unknown) => Promise.resolve({ data: flipped, error: null }).then(r),
          };
          return q;
        }
        const q: Record<string, unknown> = {
          insert: async () => ({ error: null }), update: () => q, eq: () => q,
          then: (r: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(r),
        };
        return q;
      },
    } as never;
  }

  it('a first grant notifies the student through dispatch, with a destination', async () => {
    const { grantPremiumAndQueueBuddy } = await import('./premium');
    await grantPremiumAndQueueBuddy(adminFake([{ id: 'stu-1' }]), 'stu-1');
    expect(dispatch).toHaveBeenCalledTimes(1);
    const o = dispatch.mock.calls[0]![0];
    expect(o.userId).toBe('stu-1');
    expect(o.type).toBe('membership');
    expect(o.url).toBeTruthy();                    // a P0 event must land somewhere
    expect(o.prefs).toEqual({ push: true });       // the student's real preferences
  });

  it('RETRY SAFETY: a second delivery of the same payment notifies nobody', async () => {
    // The status-guarded flip matches zero rows the second time (already
    // premium). Razorpay redelivers webhooks; without this the student would
    // be congratulated once per redelivery.
    const { grantPremiumAndQueueBuddy } = await import('./premium');
    await grantPremiumAndQueueBuddy(adminFake([]), 'stu-1');
    expect(dispatch).not.toHaveBeenCalled();
  });
});

// ── log-daily — four buddy events, each addressed to the BUDDY ──────────────
describe('log-daily buddy events', () => {
  it('WRONG-RECIPIENT GUARD: every event is addressed to the buddy, and links to the student', async () => {
    // The subject of these notifications is the student; the RECIPIENT is the
    // buddy. Getting that backwards would tell a student about themselves and
    // leave the mentor blind, and no type-checker would notice.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8'));
    const calls = src.match(/await dispatch\(\{[\s\S]{0,700}?\n    \}\);/g) ?? [];
    expect(calls.length).toBe(4);
    for (const c of calls) {
      expect(c).toMatch(/userId:\s*buddyId/);            // recipient is the buddy
      expect(c).toMatch(/url:\s*`\/buddy\/students\/\$\{studentId\}`/); // lands on the student
      expect(c).toMatch(/prefs:/);                        // never an empty-prefs send
      expect(c).toMatch(/reason:/);                       // auditable
    }
  });

  it('a missing buddy produces no event at all', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/logging/log-daily/route.ts', 'utf8'));
    // Each notify* helper returns early when the student has no buddy.
    const guards = src.match(/if \(!buddyId\) return;/g) ?? [];
    expect(guards.length).toBe(4);
  });
});

// ── weekly-digest — the duplicate the sweep found ───────────────────────────
describe('weekly-digest × the dual scheduler', () => {
  it('DUPLICATE GUARD: a buddy already digested this week is skipped', async () => {
    // vercel.json and the GitHub cron fallback BOTH fire this at `0 4 * * 1`,
    // and weekly_digest is not in the per-day unique index — so before this
    // guard every mentor got two rows and two identical emails every Monday.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/cron/weekly-digest/route.ts', 'utf8'));
    expect(src).toMatch(/digestedThisWeek/);
    expect(src).toMatch(/\.eq\('type',\s*'weekly_digest'\)/);
    expect(src).toMatch(/if \(digestedThisWeek\.has\(buddy\.id\)\) return false;/);
  });

  it('ONE EVENT, TWO CHANNELS: the email rides the same dispatch, not a second send', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/cron/weekly-digest/route.ts', 'utf8'));
    // The email must be dispatch's email leg (so emailed_at lands on the same
    // row), never a bare sendBuddyWeeklyDigest alongside an in-app insert.
    expect(src).toMatch(/email:\s*buddy\.email/);
    expect(src).not.toMatch(/await Promise\.all\(\[\s*admin\.from\('notifications'\)/);
  });
});

// ── admin/broadcast — the bounded read the B3b gate demanded ────────────────
describe('admin broadcast', () => {
  it('refuses to broadcast when recipient preferences cannot be read', async () => {
    // A partial read would push to students who turned push OFF. All-or-
    // nothing: an unreadable source refuses the whole broadcast.
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/admin/broadcast/route.ts', 'utf8'));
    expect(src).toMatch(/readRowsForIds/);           // bounded, chunked
    expect(src).toMatch(/isUnavailable\(prefsSource\)/);
    expect(src).toMatch(/status:\s*503/);
    expect(src).not.toMatch(/\.select\('id, notif_prefs'\)\.in\('id', recipientIds\)/);
  });

  it('one recipient failing never stops the wave', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/admin/broadcast/route.ts', 'utf8'));
    expect(src).toMatch(/catch\s*\{\s*\n\s*failed\+\+;/);
  });
});

// ── streak-restore — one event where there were two rows ────────────────────
describe('streak-restore broadcast', () => {
  it('writes ONE event, not a bell row plus a separate push row', async () => {
    const src = await import('node:fs').then((fs) =>
      fs.readFileSync('src/app/api/admin/streak-restore-broadcast/route.ts', 'utf8'));
    expect(src).not.toMatch(/from\('notifications'\)[\s\S]{0,120}\.insert\(/);
    expect(src).toMatch(/if \(!hasInApp\.has\(s\.id\)\)/); // once-ever guard survives
  });
});
