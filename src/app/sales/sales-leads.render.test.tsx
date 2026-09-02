import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ── /sales/leads, RENDERED ──────────────────────────────────────────────────
//
// Founder, 2 Sep 2026: every lead the counsellor sees carries a Profile
// button that opens the student's full profile. The book card was already a
// link; the affordance was invisible. This renders the real page against a
// controlled book and asserts the button is there and points at the profile.

/* eslint-disable @typescript-eslint/no-explicit-any */

const user = { id: 'anshul' };
const portfolio = vi.hoisted(() => ({ getRepPortfolio: vi.fn() }));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));
vi.mock('@/lib/admin-auth', () => ({
  requireSales: async () => ({ user, admin: {}, role: 'sales' }),
}));
vi.mock('@/lib/sales-portfolio', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getRepPortfolio: portfolio.getRepPortfolio,
}));

import MyLeadsPage from './leads/page';

const render = async (el: Promise<any>) => renderToStaticMarkup(await el);
const lead = (studentId: string, name: string, status: string) => ({
  studentId, name, phone: '+919000000001', waNumber: '919000000001', status, callbackAt: null, note: null, updatedAt: null, paid: false,
});

describe('/sales/leads — the book', () => {
  it('every lead carries a Profile button that opens the student profile', async () => {
    portfolio.getRepPortfolio.mockResolvedValue({
      leads: [lead('s1', 'Riya Sharma', 'interested'), lead('s2', 'Karan Mehta', 'follow_up')],
      summary: null, stats: null,
    });
    const html = await render(MyLeadsPage({ searchParams: Promise.resolve({}) }) as any);
    expect(html).toContain('Riya Sharma');
    expect(html).toContain('Karan Mehta');
    expect(html).toContain('href="/sales/student/s1"');
    expect(html).toContain('href="/sales/student/s2"');
    expect(html.match(/>\s*Profile\s*</g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('an empty book renders the empty state, not a crash', async () => {
    portfolio.getRepPortfolio.mockResolvedValue({ leads: [], summary: null, stats: null });
    const html = await render(MyLeadsPage({ searchParams: Promise.resolve({}) }) as any);
    expect(html).toContain('No leads here yet');
  });
});
