import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import { liveEndpointsFor } from './notification-endpoints';

/**
 * ── ONE STUDENT, MANY DEVICES: THE SEND PATH ────────────────────────────────
 *
 * Step 2 of the endpoint-registry migration. `profiles.push_subscription` is
 * ONE jsonb column, so a student who installed on a second device had the
 * first silently evicted — and a 410 from any one device ran
 * `update profiles set push_subscription = null`, declaring the whole
 * student unreachable.
 *
 * Two properties matter enough to pin as behaviour rather than shape:
 *
 *   1. NOBODY LOSES PUSH. A student with no registry row yet must still be
 *      reachable through the old column, or this migration is an outage for
 *      everyone between deploy and their next re-subscribe.
 *   2. ONE DEAD DEVICE IS NOT A DEAD STUDENT.
 */

/** Chainable fake: records the filters applied, returns the rows given. */
function adminWith(endpoints: unknown[] | null, profile?: { push_subscription: unknown } | null) {
  const calls: string[] = [];
  const make = (rows: unknown) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q: any = {
      select: () => q, eq: () => q, is: () => q, order: () => q, filter: () => q,
      single: () => Promise.resolve({ data: rows, error: null }),
      maybeSingle: () => Promise.resolve({ data: rows, error: null }),
      then: (res: (v: unknown) => unknown) => Promise.resolve({ data: rows, error: null }).then(res),
    };
    return q;
  };
  return {
    calls,
    admin: {
      from: (table: string) => {
        calls.push(table);
        if (table === 'notification_endpoints') return make(endpoints ?? []);
        if (table === 'profiles') return make(profile ?? null);
        return make([]);
      },
    },
  };
}

describe('every registered device is returned, not just one', () => {
  it('a student with two live endpoints yields both', async () => {
    const { admin } = adminWith([
      { id: 'e1', provider: 'web_push', subscription: { endpoint: 'https://fcm/phone' }, device_token: null },
      { id: 'e2', provider: 'web_push', subscription: { endpoint: 'https://fcm/laptop' }, device_token: null },
    ]);
    const eps = await liveEndpointsFor(admin, 'stu-1');
    expect(eps).toHaveLength(2);
    expect(eps.map((e) => e.id)).toEqual(['e1', 'e2']);
  });

  it('REGRESSION: the single column could only ever express one device', () => {
    // What the old shape allowed, demonstrated rather than described: one
    // value, so writing the second erases the first.
    let pushSubscription: unknown = { endpoint: 'https://fcm/phone' };
    pushSubscription = { endpoint: 'https://fcm/laptop' }; // second install
    expect(pushSubscription).toEqual({ endpoint: 'https://fcm/laptop' });
  });
});

describe('the fallback: nobody who was reachable becomes unreachable', () => {
  it('with NO registry rows, the old profile column is still used', async () => {
    const { admin, calls } = adminWith([], { push_subscription: { endpoint: 'https://fcm/legacy' } });
    const eps = await liveEndpointsFor(admin, 'stu-2');
    expect(eps).toHaveLength(1);
    expect(eps[0].subscription).toEqual({ endpoint: 'https://fcm/legacy' });
    expect(calls, 'it must actually consult profiles, not guess').toContain('profiles');
  });

  it('the fallback endpoint carries id null — there is no row to revoke or record against', async () => {
    const { admin } = adminWith([], { push_subscription: { endpoint: 'https://fcm/legacy' } });
    const [ep] = await liveEndpointsFor(admin, 'stu-2');
    expect(ep.id).toBeNull();
  });

  it('a student with neither is simply unreachable — no invented endpoint', async () => {
    const { admin } = adminWith([], null);
    expect(await liveEndpointsFor(admin, 'stu-3')).toEqual([]);
  });

  it('registry rows WIN over the column — the column is a fallback, not a merge', async () => {
    // Merging both would double-send to the same device: the backfill copied
    // the column INTO the registry, so they are the same subscription.
    const { admin } = adminWith(
      [{ id: 'e1', provider: 'web_push', subscription: { endpoint: 'https://fcm/phone' }, device_token: null }],
      { push_subscription: { endpoint: 'https://fcm/phone' } },
    );
    expect(await liveEndpointsFor(admin, 'stu-4')).toHaveLength(1);
  });
});

describe('one dead device never kills the student', () => {
  const PUSH = codeOnly(readFileSync(join(__dirname, 'push.ts'), 'utf8'));

  it('a terminal failure revokes the ENDPOINT, not the profile column', () => {
    // attemptSend used to run `update profiles set push_subscription = null`
    // inline on any 410. With several endpoints that is one stale laptop
    // marking a live phone as dead.
    const attemptSend = PUSH.slice(PUSH.indexOf('async function attemptSend'));
    expect(
      attemptSend.includes("push_subscription: null"),
      'attemptSend must not null the student column on one endpoint dying',
    ).toBe(false);
    expect(PUSH).toMatch(/revokeEndpoint\(admin, ep\.id/);
  });

  it('the student is only declared dead when EVERY endpoint failed terminally', () => {
    expect(PUSH).toMatch(/const allTerminal = results\.every\(\(r\) => r\.terminal\)/);
    const deathBlock = PUSH.slice(PUSH.indexOf('const allTerminal'), PUSH.indexOf('return results[0]'));
    expect(deathBlock).toContain('push_died_at');
    expect(deathBlock).toContain('reportPushDeath');
  });

  it('one success is a delivered push, whatever the other devices did', () => {
    expect(PUSH).toMatch(/const delivered = results\.find\(\(r\) => r\.ok\)/);
  });

  it('a student who lands on ANY endpoint has their death flag cleared', () => {
    // The old columns must stay true for Step 3's remaining readers: a
    // student we just reached is not "disconnected" on the dashboard.
    const ok = PUSH.slice(PUSH.indexOf('const delivered'), PUSH.indexOf('return { ok: true }'));
    expect(ok).toMatch(/push_died_at: null/);
  });
});

describe('registration dual-writes, so a second device adds instead of evicting', () => {
  const SUBSCRIBE = codeOnly(readFileSync(join(__dirname, '..', 'app', 'api', 'push', 'subscribe', 'route.ts'), 'utf8'));
  const ONBOARDING = codeOnly(readFileSync(join(__dirname, 'onboarding-apply.ts'), 'utf8'));

  it('the authenticated toggle writes BOTH the column and the registry', () => {
    expect(SUBSCRIBE).toContain("from('profiles').update(update)");
    expect(SUBSCRIBE).toMatch(/registerWebPushEndpoint\(admin, user\.id, subscription/);
  });

  it('the pre-auth signup path does too — it was the caller that skipped fields before', () => {
    expect(ONBOARDING).toContain('registerWebPushEndpoint(admin, userId');
  });

  it('the pre-auth registry write happens only AFTER the profile write succeeds', () => {
    // An endpoint row for a profile update that failed is a device we would
    // push to for an account that never got set up.
    const write = ONBOARDING.indexOf("from('profiles').update(profileUpdate)");
    const register = ONBOARDING.indexOf('registerWebPushEndpoint(admin, userId');
    expect(write).toBeGreaterThan(-1);
    expect(register).toBeGreaterThan(write);
  });

  it('turning push OFF revokes every device, not just the current one', () => {
    // A student-level decision, unlike a 410. Otherwise reminders keep
    // arriving on their other registered device after they switched them off.
    expect(SUBSCRIBE).toMatch(/revokeAllEndpoints\(admin, user\.id/);
  });
});

describe('the send boundary is unchanged', () => {
  it('dispatch() is still the only thing that may call the transport', () => {
    // This migration must not become a second way to send. The existing
    // send-boundary guard owns the rule; this asserts the new module did not
    // quietly acquire a transport of its own.
    const REG = codeOnly(readFileSync(join(__dirname, 'notification-endpoints.ts'), 'utf8'));
    expect(REG).not.toContain('webpush');
    expect(REG).not.toContain('sendNotification');
  });
});
