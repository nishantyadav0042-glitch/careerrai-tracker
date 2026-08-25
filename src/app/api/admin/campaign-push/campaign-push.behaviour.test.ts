import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest } from 'next/server';

// ── THE CAMPAIGN WAVE, EXECUTED AGAINST THE ONE-PITCH RULE ──────────────────
//
// The final completion audit found this route could blast a Buddy offer to
// every free student with zero regard for the day's pitch — the modal in the
// morning, the campaign at noon: two pitches, rule broken. These tests DRIVE
// the real handler with a two-student audience and assert who was claimed,
// who was skipped, and that one student's taken day never bleeds into
// another's send. Non-vacuity is proved by removing the gate (see the sweep
// script in the audit): with the claim gone, the double-pitch test fails.

/* eslint-disable @typescript-eslint/no-explicit-any */

const dispatch = vi.hoisted(() => vi.fn(async () => 'sent'));
const claim = vi.hoisted(() => vi.fn());

let students: Array<{ id: string; full_name: string; notif_prefs: { push: boolean }; last_seen_at: string }>;

vi.mock('@/lib/admin-auth', () => ({
  requireAdmin: async () => ({
    user: { id: 'admin-1' },
    admin: {
      from: () => ({
        select: () => ({
          eq: () => ({ not: () => ({ not: () => ({ not: () => Promise.resolve({ data: students }) }) }) }),
        }),
      }),
    },
  }),
}));
vi.mock('@/lib/notification-os', () => ({ dispatch }));
vi.mock('@/lib/promo-impression', () => ({ claimBuddyPitch: claim }));
vi.mock('@/lib/campaign', () => ({
  CAMPAIGN: { id: 'test-campaign', slots: 50 },
  campaignState: () => ({ live: true, phase: 'peak', seatsLeft: 10 }),
  mayShowSeatsLeft: () => false,
}));
vi.mock('@/lib/pricing', () => ({ campaignSeatsSold: async () => 40 }));

import { POST } from './route';

const req = (body: Record<string, unknown>) =>
  ({ json: async () => body } as unknown as NextRequest);

beforeEach(() => {
  vi.clearAllMocks();
  claim.mockResolvedValue({ show: true });
  students = [
    { id: 'stu-1', full_name: 'One', notif_prefs: { push: true }, last_seen_at: new Date().toISOString() },
    { id: 'stu-2', full_name: 'Two', notif_prefs: { push: true }, last_seen_at: new Date().toISOString() },
  ];
});

describe('the wave asks the promo authority for every student, before the wire', () => {
  it('claims per student, on the approved_push channel, before dispatching', async () => {
    const res = await POST(req({ wave: 'peak', dryRun: false }));
    expect(claim).toHaveBeenCalledTimes(2);
    expect(claim.mock.calls.every((c) => c[2] === 'approved_push')).toBe(true);
    // ORDER: the claim precedes the send for the same student — never
    // "send first, record later".
    expect(claim.mock.invocationCallOrder[0]).toBeLessThan(dispatch.mock.invocationCallOrder[0]);
    expect((await res.json()).sent).toBe(2);
  });

  it('a student already pitched today is SKIPPED — and does not block the rest of the wave', async () => {
    // stu-1's day is taken (morning modal); stu-2 is clean.
    claim.mockImplementation(async (_a: unknown, id: string) =>
      id === 'stu-1' ? { show: false, reason: 'already_pitched_today' } : { show: true });
    const body = await (await POST(req({ wave: 'wide', dryRun: false }))).json();
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect((dispatch.mock.calls[0][0] as { userId: string }).userId).toBe('stu-2');
    expect(body.sent).toBe(1);
    expect(body.alreadyPitched).toBe(1);
  });

  it('a claim that fails for infrastructure reasons also skips — fail closed', async () => {
    claim.mockResolvedValue({ show: false, reason: 'claim_failed' });
    const body = await (await POST(req({ wave: 'soft', dryRun: false }))).json();
    expect(dispatch).not.toHaveBeenCalled();
    expect(body.sent).toBe(0);
  });

  it('dryRun claims NOTHING — previewing an audience must not burn 400 pitch slots', async () => {
    const body = await (await POST(req({ wave: 'peak' }))).json();
    expect(body.dryRun).toBe(true);
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
});
