import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── EVERY privileged route has a gate, and the sweep is not done by hand ─────
//
// During the 84c2be3 release audit I swept the admin and sales routes by grep
// and seven came back with NO GATE FOUND. All seven were false positives —
// they use isRequestAdmin(), which my pattern did not know about. That is the
// problem with a hand sweep: it is only as good as the patterns the person
// happened to think of, and it has to be redone from memory every time.
//
// This makes it a test. A new privileged route with no recognised gate fails
// CI, and a NEW KIND of gate has to be added here deliberately — which is the
// review step that catches "I invented my own auth check".

const API = join(process.cwd(), 'src', 'app', 'api');

function routes(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const full = join(dir, e);
    if (statSync(full).isDirectory()) routes(full, out);
    else if (e === 'route.ts') out.push(full);
  }
  return out;
}

/** The gates this codebase recognises. Adding one here is a deliberate act. */
const GATES = [
  /requireAdmin\b/,              // admin page/route context, 503 on unreadable role
  /isRequestAdmin\(/,            // boolean admin check, 403 on false
  /requireAdminCtx\(/,
  /requireSales\(/,              // sales OR admin
  /salesPrincipal\(/,            // canonical principal, role checked at the call site
  /role\s*!==\s*'admin'/,
  /principal\.role\s*!==\s*'admin'/,
  /requireCron\(|assertCron\(|cron-auth/,   // scheduled jobs carry their own secret
];

const PRIVILEGED = routes(API)
  .map((f) => f.slice(process.cwd().length + 1))
  .filter((f) => f.includes('/api/admin/') || f.includes('/api/sales/'));

describe('every admin and sales route is gated', () => {
  it('the sweep finds a realistic number of routes', () => {
    expect(PRIVILEGED.length).toBeGreaterThan(30);
  });

  it.each(PRIVILEGED)('%s has a recognised authorization gate', (file) => {
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const gated = GATES.some((g) => g.test(src));
    expect(
      gated,
      `${file} has no recognised gate. Use requireAdmin/requireSales/salesPrincipal — `
        + 'or, if this route genuinely introduces a new kind of gate, add it to GATES here '
        + 'so the decision is reviewed rather than assumed.',
    ).toBe(true);
  });
});

describe('the money and pay routes are ADMIN, never merely sales', () => {
  // A counsellor must not be able to change what they are paid, hand
  // themselves leads, or repair a payment. Each of these reaches money or
  // attribution, so `requireSales` (which also admits sales) is not enough.
  const ADMIN_ONLY = [
    'src/app/api/admin/rep-config/route.ts',        // incentive rate, fixed fee, capacity
    'src/app/api/admin/create-sales-rep/route.ts',  // creating a seat and its terms
    'src/app/api/admin/reassign-lead/route.ts',     // who owns a lead
    'src/app/api/admin/distribute-leads/route.ts',  // bulk ownership
    'src/app/api/admin/retry-unlock/route.ts',      // grants premium
    'src/app/api/admin/payouts/route.ts',           // mentor payout amounts
    'src/app/api/admin/refunds/route.ts',           // money back
  ];

  it.each(ADMIN_ONLY)('%s requires admin, not just sales', (file) => {
    const src = readFileSync(file, 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1');
    const adminChecked = /role\s*!==\s*'admin'/.test(src)
      || /principal\.role\s*!==\s*'admin'/.test(src)
      || /requireAdmin\b/.test(src)
      || /isRequestAdmin\(/.test(src);
    expect(adminChecked, `${file} must check for admin explicitly`).toBe(true);
    // requireSales() alone admits a counsellor. If it is the ONLY gate, a rep
    // could reach a route that decides their own pay.
    const salesOnly = /requireSales\(/.test(src) && !adminChecked;
    expect(salesOnly, `${file} is gated by requireSales alone — a counsellor could reach it`).toBe(false);
  });
});

describe('a counsellor cannot write their own pay terms', () => {
  it('rep-config refuses a non-admin before reading the body', () => {
    const src = readFileSync('src/app/api/admin/rep-config/route.ts', 'utf8');
    const gate = src.search(/role\s*!==\s*'admin'/);
    const body = src.search(/await request\.json\(\)/);
    expect(gate).toBeGreaterThan(-1);
    expect(gate, 'authorize before parsing input').toBeLessThan(body);
  });
});
