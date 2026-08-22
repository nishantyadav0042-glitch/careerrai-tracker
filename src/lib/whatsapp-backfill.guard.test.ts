import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { WHATSAPP_GROUP_URL } from '@/components/onboarding/whatsapp-optin';

// ── The one-time WhatsApp backfill for pre-14-Aug students ──────────────────
//
// Founder, 15 Aug: 363 students signed up before the in-app WhatsApp ask
// existed and were never offered it. Verified against production the same
// night: only 26% of them (92/360) have a live push subscription — the other
// 74% cannot be reached by the push half of this campaign at all. That split
// is why this backfill has two halves, not one: cron/whatsapp-backfill for
// whoever push CAN reach, the wa-messages.ts 'whatsapp_join' template for the
// team to hand-send to everyone else via the existing WhatsApp composer.

const ROUTE = 'src/app/api/cron/whatsapp-backfill/route.ts';

/** The commit's author date, or null when this checkout cannot see it.
 *
 *  CI checks out at depth 1, so a commit from 15 Aug is simply not in the
 *  runner's object store and `git log` exits 128. That is the environment
 *  failing to answer the question — it is NOT the cutoff being wrong, and the
 *  distinction is the same one the payment boundary is built on: an
 *  infrastructure limitation must never be converted into a FALSE verdict
 *  about business state. A guard that cannot see the evidence reports
 *  UNKNOWN and checks what it still can. */
function commitDateIso(sha: string): string | null {
  try {
    const out = execSync(`git log -1 --format=%aI ${sha}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

describe('the cutoff is the real deploy instant, not a rounded guess', () => {
  it('matches the commit that actually shipped the WhatsApp screen', () => {
    const src = readFileSync(ROUTE, 'utf8');
    const match = src.match(/WHATSAPP_SCREEN_SHIPPED_AT = '([^']+)'/);
    expect(match, 'cutoff constant not found').not.toBeNull();

    // Always true, history or not: the cutoff must be a real instant. A
    // malformed constant would silently make every student pre-cutoff.
    const cutoff = new Date(match![1]).getTime();
    expect(Number.isFinite(cutoff), `cutoff is not a valid instant: ${match![1]}`).toBe(true);

    const commitDate = commitDateIso('caa9d43');
    if (commitDate === null) return; // shallow checkout — evidence unavailable
    expect(cutoff).toBe(new Date(commitDate).getTime());
  });
});

describe('idempotent by construction, so it is safe to leave cron-scheduled', () => {
  it('dedupes on an existing whatsapp_backfill row before sending', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain("eq('type', 'whatsapp_backfill')");
    expect(src).toContain('if (done.has(s.id)) continue;');
  });

  it('goes through the one canonical send boundary, not a direct transport call', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain("from '@/lib/notification-os'");
    expect(src).toContain('dispatch({');
    expect(src).not.toContain('sendPushToUser');
  });

  it('excludes test and demo accounts from a real send', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain("not('is_test_account', 'is', true)");
    expect(src).toContain("not('is_demo', 'is', true)");
  });
});

describe('the push deep-links straight to the group, not the app', () => {
  it('url is the real WhatsApp invite, not SITE_URL', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain('url: WHATSAPP_GROUP_URL');
  });

  it('WHATSAPP_GROUP_URL is still a real chat.whatsapp.com invite', () => {
    expect(WHATSAPP_GROUP_URL).toMatch(/^https:\/\/chat\.whatsapp\.com\//);
  });
});

describe('cron auth and scheduling', () => {
  it('requires the cron secret like every other scheduled route', () => {
    const src = readFileSync(ROUTE, 'utf8');
    expect(src).toContain('authorizedCron(request)');
  });

  it('is registered in vercel.json', () => {
    const cfg = readFileSync('vercel.json', 'utf8');
    expect(cfg).toContain('/api/cron/whatsapp-backfill');
  });
});
