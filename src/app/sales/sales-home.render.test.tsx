import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

// ── /sales, RENDERED ────────────────────────────────────────────────────────
//
// The first page a counsellor opens, and the first step of the founder smoke
// test. It was never rendered by any test: the previous render suite covered
// the three pages added on 28 Aug and left the one they navigate FROM.
//
// This is the pre-flight check, so the cases are the ones a brand-new rep on
// day one actually produces: an empty queue, no capacity row yet, and an
// intervention ledger with nothing in it.

/* eslint-disable @typescript-eslint/no-explicit-any */

let currentAdmin: any;
const user = { id: 'anshul' };

const queueMock = vi.hoisted(() => ({ buildCallQueue: vi.fn() }));
const capacityMock = vi.hoisted(() => ({ getTeamCapacity: vi.fn(), BINDING_LABEL: {} as Record<string, string> }));

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => currentAdmin }));
vi.mock('@/lib/admin-auth', () => ({
  requireSales: async () => ({ user, admin: currentAdmin, role: 'sales' }),
}));
vi.mock('@/lib/sales-authz', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  salesPrincipal: async () => ({ id: 'anshul', role: 'sales' }),
}));
vi.mock('@/lib/call-queue', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  buildCallQueue: queueMock.buildCallQueue,
}));
vi.mock('@/lib/sales-capacity', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getTeamCapacity: capacityMock.getTeamCapacity,
}));

import SalesCallsPage from './page';
import type { CallLead } from '@/lib/call-queue';

function admin(rows: Record<string, unknown>) {
  const chain = (table: string) => {
    const c: any = {};
    for (const m of ['select', 'eq', 'gte', 'lte', 'lt', 'in', 'is', 'not', 'order', 'limit']) c[m] = () => c;
    const settle = (single: boolean) => (ok: any) => {
      const v = rows[table];
      if (v instanceof Error) return Promise.resolve({ data: null, error: { message: v.message } }).then(ok);
      return Promise.resolve({ data: single ? ((v as any[])?.[0] ?? null) : (v ?? []), error: null }).then(ok);
    };
    c.maybeSingle = () => ({ then: settle(true) });
    c.single = () => ({ then: settle(true) });
    c.then = settle(false);
    return c;
  };
  return { from: (t: string) => chain(t) };
}

const CFG = {
  repId: 'anshul', active: true, employmentType: 'part_time' as const,
  workDays: [1, 3, 4, 5, 6, 7], workStartIst: '17:00', workEndIst: '22:00',
  maxCapacityUnits: 40, maxNewPerDay: 8, firstContactSlaMinutes: 120,
  unavailableUntil: null, capacityOverride: null, overrideUntil: null,
};

beforeEach(() => {
  currentAdmin = admin({ intervention_ledger: [] });
  queueMock.buildCallQueue.mockResolvedValue({ queue: [], connectedToday: 0, dueNow: 0, totalOpen: 0 });
  capacityMock.getTeamCapacity.mockResolvedValue([]);
});

const render = async (el: Promise<any>) => renderToStaticMarkup(await el);

describe('/sales on day one', () => {
  it('renders with an empty queue and NO capacity row configured', async () => {
    // The literal first load for a rep created minutes earlier. Every optional
    // block is absent at once — this is where an unguarded `mine.capacity`
    // would throw.
    const html = await render(SalesCallsPage() as any);
    expect(html).toContain('No one to call right now');
    // CHANGED 29 Aug 2026: the headline is now the checkpoint, computed from
    // what the system recorded giving them rather than a motivational line. A
    // day with nothing worth doing reads as quiet — which is information about
    // the base, not evidence about the counsellor (SALES-OS.md §5).
    expect(html).toContain('Nothing needs attention right now');
    expect(html, 'a quiet day must never be framed as failure or a missed target')
      .not.toMatch(/target|quota|behind|only \d+/i);
  });

  it('renders once a capacity row exists', async () => {
    capacityMock.getTeamCapacity.mockResolvedValue([{
      repId: 'anshul', name: 'Anshul Yadav', configured: true, config: CFG,
      capacity: 40, activeNow: 0, available: 40, newToday: null, overflow: 0,
      inWindow: true, binding: 'ASSIGNABLE', readFailed: false, workItems: [], dormantCount: 0,
    }]);
    const html = await render(SalesCallsPage() as any);
    expect(html).toContain('0 of 40 active');
    expect(html).toContain('40 slots free');
  });

  it('renders with leads waiting in the queue', async () => {
    queueMock.buildCallQueue.mockResolvedValue({
      // TYPED against the real CallLead, deliberately. My first attempt at this
      // fixture omitted `tier`, and CallDeck threw on `lead.tier.toUpperCase()`
      // — which looked like a product defect for a moment. It was not: `tier`
      // is required on the interface and buildCallQueue always sets it. Typing
      // the fixture is what makes that distinction automatic instead of a
      // judgement call at 2am.
      queue: [{
        studentId: 's1', name: 'Riya Sharma', firstName: 'Riya',
        phone: '+919000000001', waNumber: null,
        convScore: 42, tier: 'warm', momentumScore: 30, momentumBand: 'Steady', hot: false,
        brief: ['Has not logged in 6 days'],
        dueReason: 'fresh', dueLabel: 'New lead', why: ['No study logs in 30 days'],
        action: 'Introduction call — learn where they are in prep',
        status: 'not_contacted', noAnswerCount: 0, buddyTaps: 0,
        objective: 'retention', objectiveSecondary: null, lastInteraction: null,
      } satisfies CallLead],
      connectedToday: 0, dueNow: 0, totalOpen: 1,
    });
    const html = await render(SalesCallsPage() as any);
    expect(html).toContain('1 in your queue');
    expect(html).not.toContain('No one to call right now');
  });

  it('an unreadable outcomes ledger does not take the page down', async () => {
    // The read is CHECKED in the page: a failure must render the queue anyway
    // rather than 500 the whole screen. A rep who cannot see last month's
    // outcomes can still make today's calls.
    currentAdmin = admin({ intervention_ledger: new Error('ledger down') });
    const html = await render(SalesCallsPage() as any);
    expect(html).toContain('No one to call right now');
  });
});
