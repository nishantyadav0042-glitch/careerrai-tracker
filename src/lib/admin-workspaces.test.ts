import { describe, it, expect } from 'vitest';
import { readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { WORKSPACES, allRoutes, workspaceForPath, UNLISTED } from './admin-workspaces';

// ── The rule that keeps the admin panel organised ───────────────────────────
//
// Founder, 9 Aug: twelve workspaces, and every daily responsibility has exactly
// one home. The inventory that prompted it found ELEVEN pages nothing linked
// to, including /admin/health, whose own header called it "The morning screen.
// Not Mixpanel, not Supabase — this."
//
// A reorganisation that is only a one-off tidy drifts straight back; the nav's
// own comment from 14 July says the panel "had grown into a pile of tabs +
// quick-link buttons + orphan pages", and by 9 Aug it had grown back. So the
// structure is enforced by the build, not by discipline.

/** Every admin route that exists as a file. */
function pagesOnDisk(dir = 'src/app/admin', prefix = '/admin'): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...pagesOnDisk(p, `${prefix}/${entry}`));
    else if (entry === 'page.tsx') out.push(prefix);
  }
  return out;
}

const ON_DISK = pagesOnDisk();
const CLAIMED = new Set(allRoutes());

describe('every admin page has exactly one home', () => {
  it('no page is an orphan', () => {
    // THE defect this whole reorganisation exists to end. A page reachable only
    // by typing its URL is a page nobody opens and nobody deletes.
    const orphans = ON_DISK.filter((r) => !CLAIMED.has(r) && !(r in UNLISTED));
    expect(
      orphans,
      `these admin pages belong to no workspace — add them to WORKSPACES or to UNLISTED with a reason:\n  ${orphans.join('\n  ')}`,
    ).toEqual([]);
  });

  it('no page is claimed by two workspaces', () => {
    // /admin/sales-queue used to sit in BOTH the Today dashboard and System,
    // described differently in each. Two parents means two mental models.
    const seen = new Map<string, string[]>();
    for (const w of WORKSPACES) {
      for (const route of [w.href, ...w.tabs.map((t) => t.href)]) {
        if (!route || route === w.href) continue;
        seen.set(route, [...(seen.get(route) ?? []), w.label]);
      }
    }
    const shared = [...seen.entries()].filter(([, owners]) => owners.length > 1);
    expect(
      shared.map(([r, o]) => `${r} claimed by ${o.join(' + ')}`),
      'a route with two owners has two meanings',
    ).toEqual([]);
  });

  it('every route the structure claims actually exists on disk', () => {
    // The mirror of the orphan check: a nav entry pointing at nothing is a
    // dead tab, which is worse than a missing one because it looks fine.
    const onDisk = new Set(ON_DISK);
    const missing = allRoutes().filter((r) => !onDisk.has(r) && !existsSync(`src/app${r}/page.tsx`));
    expect(missing, `these routes are in the nav but have no page:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});

describe('the structure matches what the founder asked for', () => {
  it('is a small number of workspaces, not a page list', () => {
    // "It should feel like an operating system with 10-12 clear workspaces."
    expect(WORKSPACES.length).toBeGreaterThanOrEqual(10);
    expect(WORKSPACES.length).toBeLessThanOrEqual(12);
  });

  it('gives every workspace a stated job', () => {
    // Ten of the old pages carried no comment explaining what they were for.
    for (const w of WORKSPACES) {
      expect(w.purpose.length, `${w.label} has no purpose line`).toBeGreaterThan(20);
      expect(w.tabs.length, `${w.label} has no tabs`).toBeGreaterThan(0);
    }
  });

  it('has unique ids and labels', () => {
    expect(new Set(WORKSPACES.map((w) => w.id)).size).toBe(WORKSPACES.length);
    expect(new Set(WORKSPACES.map((w) => w.label)).size).toBe(WORKSPACES.length);
  });

  it('keeps analytics in ONE place — never two funnels', () => {
    // Growth and Analytics were two screens with no documented boundary.
    const analytics = WORKSPACES.find((w) => w.id === 'analytics')!;
    const tabHrefs = analytics.tabs.map((t) => t.href);
    expect(tabHrefs).toContain('/admin/growth');
    expect(tabHrefs).toContain('/admin/analytics');
    // And no OTHER workspace may claim either of them.
    for (const w of WORKSPACES) {
      if (w.id === 'analytics') continue;
      expect(w.tabs.map((t) => t.href)).not.toContain('/admin/growth');
    }
  });
});

describe('a tab with no data is never rendered as a live number', () => {
  it('every planned tab says what it is blocked on, and links nowhere', () => {
    // Gemini cost, OCR failure rate, MRR, call recordings, A/B tests and
    // feature flags have NO source in the database today. A confident "0" for
    // any of them is the same defect class as a cron that skips students and
    // still reports success.
    const planned = WORKSPACES.flatMap((w) => w.tabs.filter((t) => t.status === 'planned'));
    expect(planned.length, 'the honest gaps should be recorded, not hidden').toBeGreaterThan(0);
    for (const t of planned) {
      expect(t.href, `"${t.label}" is planned but links somewhere`).toBeNull();
      expect(t.blockedOn, `"${t.label}" is planned with no reason given`).toBeTruthy();
      expect(t.blockedOn!.length).toBeGreaterThan(15);
    }
  });

  it('every live or moved tab has a real route', () => {
    for (const w of WORKSPACES) {
      for (const t of w.tabs) {
        if (t.status === 'planned') continue;
        expect(t.href, `${w.label} → "${t.label}" is ${t.status} but has no route`).toBeTruthy();
      }
    }
  });
});

describe('the nav highlights the right workspace', () => {
  it('matches the most specific route, not the first', () => {
    // /admin is a prefix of everything, so a naive startsWith would light up
    // Command on every single screen.
    expect(workspaceForPath('/admin')?.id).toBe('command');
    expect(workspaceForPath('/admin/students')?.id).toBe('students');
    expect(workspaceForPath('/admin/streak-breakers')?.id).toBe('students');
    expect(workspaceForPath('/admin/coupons')?.id).toBe('finance');
    expect(workspaceForPath('/admin/growth')?.id).toBe('analytics');
  });

  it('resolves a detail page to its parent workspace', () => {
    expect(workspaceForPath('/admin/leads/abc-123')?.id).toBe('sales');
  });

  it('returns null rather than guessing for an unknown path', () => {
    expect(workspaceForPath('/admin/nope-not-real')).toBeNull();
  });
});

describe('the unlisted escape hatch stays small and justified', () => {
  it('every unlisted route gives a reason', () => {
    for (const [route, reason] of Object.entries(UNLISTED)) {
      expect(reason.length, `${route} is unlisted with no reason`).toBeGreaterThan(20);
    }
  });

  it('stays small — it is an exception list, not a second structure', () => {
    expect(Object.keys(UNLISTED).length).toBeLessThanOrEqual(5);
  });
});
