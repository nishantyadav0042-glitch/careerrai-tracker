import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { WORKSPACES } from './admin-workspaces';
import { planDisposition } from './sales-disposition';

// ── The sales loop, driven end to end ───────────────────────────────────────
//
// Founder, 21 Aug: "the CRM is basically not there." It was there — every
// piece of it — and nothing could reach it, nothing had ever been written
// through it (lead_outreach and sales_activity were both EMPTY in production
// after weeks live), and the one sales page that WAS reachable was built by a
// different authority than the CRM.
//
// A route existing is not a feature. These cases drive the REAL queue builder
// and the REAL disposition engine through a lead's whole life: arrives →
// queued → called → outcome recorded → follow-up due → converted → gone. If a
// stage silently drops the lead, one of these fails.

const ROSTER = [
  { id: 'fresh-1', full_name: 'Fresh Student', phone: '9800000001', score: 60, band: 'on_track',
    reachable: true, isPremium: false, hasBuddy: false, daysSinceLastLog: 2, buddyCtaClicks: 2 },
  { id: 'lead-2', full_name: 'Second Student', phone: '9800000002', score: 40, band: 'at_risk',
    reachable: true, isPremium: false, hasBuddy: false, daysSinceLastLog: 5, buddyCtaClicks: 0 },
];
vi.mock('@/lib/momentum', async (orig) => ({
  ...(await orig<typeof import('./momentum')>()),
  getRosterMomentum: vi.fn(async () => ROSTER),
}));

import { buildCallQueue } from './call-queue';

/** Fake DB: `outreach` rows drive lead state; everything else is empty but OK. */
function db(outreach: Record<string, unknown>[], opts: { outreachFails?: boolean } = {}) {
  const chain = (table: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const c: any = {};
    for (const m of ['select', 'in', 'eq', 'gte', 'lt', 'gt', 'not', 'order', 'limit']) c[m] = () => c;
    c.then = (ok: (r: unknown) => unknown) => {
      if (table === 'lead_outreach') {
        return Promise.resolve(
          opts.outreachFails ? { data: null, error: { message: 'connection reset' } } : { data: outreach, error: null },
        ).then(ok);
      }
      return Promise.resolve({ data: [], error: null }).then(ok);
    };
    return c;
  };
  return { from: (t: string) => chain(t) };
}

const HOUR = 3600_000;
beforeEach(() => vi.clearAllMocks());

describe('Scenario A — a new lead reaches the rep', () => {
  it('a student nobody has called appears in the queue as fresh work', async () => {
    const { queue, totalOpen } = await buildCallQueue(db([]));
    const lead = queue.find((l) => l.studentId === 'fresh-1');
    expect(lead, 'a never-called free student must surface as a lead').toBeTruthy();
    expect(lead!.dueReason).toBe('fresh');
    expect(lead!.dueLabel).toBe('New lead');
    expect(totalOpen).toBe(2);
  });

  it('the card carries the brief the rep reads before dialing — never a blank row', async () => {
    const { queue } = await buildCallQueue(db([]));
    const lead = queue.find((l) => l.studentId === 'fresh-1')!;
    expect(lead.brief.length).toBeGreaterThan(2);
    expect(lead.phone, 'a lead with no way to call it is not work').toBeTruthy();
  });

  it('higher intent is called first — the queue is ordered work, not a table', async () => {
    const { queue } = await buildCallQueue(db([]));
    expect(queue[0].studentId).toBe('fresh-1'); // 2 buddy taps, logged 2 days ago
  });
});

describe('Scenario B — the call is recorded and the state moves', () => {
  it('no answer schedules a retry and the lead comes back when it is due', async () => {
    const now = Date.parse('2026-08-21T06:00:00Z'); // 11:30 IST
    const plan = planDisposition('no_answer', { prevMisses: 0, hot: false, nowMs: now });
    expect(plan.status).toBe('no_answer');
    // The retry is scheduled into the FUTURE relative to the call — a missed
    // call always comes back, and never immediately.
    expect(Date.parse(plan.nextActionAt!)).toBeGreaterThan(now);

    // Before it is due: not today's work (no repeat dialing the same day).
    const pending = await buildCallQueue(db([{
      student_id: 'fresh-1', status: 'no_answer', next_action_at: new Date(Date.now() + 3 * HOUR).toISOString(),
      last_attempt_at: new Date().toISOString(), no_answer_count: 1, callback_at: null, owner: null,
    }]));
    expect(pending.queue.find((l) => l.studentId === 'fresh-1')).toBeFalsy();

    // Once due, it is back — labelled as a retry, above fresh leads.
    const due = await buildCallQueue(db([{
      student_id: 'fresh-1', status: 'no_answer', next_action_at: new Date(Date.now() - HOUR).toISOString(),
      last_attempt_at: new Date(Date.now() - 26 * HOUR).toISOString(), no_answer_count: 1, callback_at: null, owner: null,
    }]));
    const lead = due.queue.find((l) => l.studentId === 'fresh-1');
    expect(lead!.dueReason).toBe('retry');
    expect(due.queue[0].studentId).toBe('fresh-1');
    expect(due.dueNow).toBe(1);
  });

  it('a connected call today is counted, and the lead is not dialed again today', async () => {
    const { queue, connectedToday } = await buildCallQueue(db([{
      student_id: 'fresh-1', status: 'interested', next_action_at: new Date(Date.now() + 48 * HOUR).toISOString(),
      last_attempt_at: new Date().toISOString(), no_answer_count: 0, callback_at: null, owner: null,
    }]));
    expect(connectedToday).toBe(1);
    expect(queue.find((l) => l.studentId === 'fresh-1')).toBeFalsy();
  });
});

describe('Scenario C — a promised follow-up never disappears', () => {
  it('"call me at 6" survives as state and returns at its time, top of the queue', async () => {
    const cbLocal = '2026-08-22T18:00';
    const plan = planDisposition('callback', {
      prevMisses: 0, hot: true, callbackAtLocal: cbLocal, nowMs: Date.parse('2026-08-21T06:00:00Z'),
    });
    expect(plan.status).toBe('follow_up');
    expect(plan.callbackAt).toBe(plan.nextActionAt); // the promise IS the clock

    const due = await buildCallQueue(db([{
      student_id: 'lead-2', status: 'follow_up', next_action_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      callback_at: new Date(Date.now() - 5 * 60_000).toISOString(),
      last_attempt_at: new Date(Date.now() - 30 * HOUR).toISOString(), no_answer_count: 0, owner: null,
    }]));
    const lead = due.queue.find((l) => l.studentId === 'lead-2')!;
    expect(lead.dueReason).toBe('callback');
    // A promise to a student outranks any cold lead, however hot the cold one is.
    expect(due.queue[0].studentId).toBe('lead-2');
  });

  it('an interested lead returns as a scheduled follow-up, not as a new lead', async () => {
    const due = await buildCallQueue(db([{
      student_id: 'lead-2', status: 'interested', next_action_at: new Date(Date.now() - HOUR).toISOString(),
      last_attempt_at: new Date(Date.now() - 50 * HOUR).toISOString(), no_answer_count: 0, callback_at: null, owner: null,
    }]));
    expect(due.queue.find((l) => l.studentId === 'lead-2')!.dueReason).toBe('followup');
  });
});

describe('Scenario D — a closed lead stays closed', () => {
  it('converted and not_interested never re-enter the queue', async () => {
    for (const status of ['converted', 'not_interested']) {
      const { queue, totalOpen } = await buildCallQueue(db([
        { student_id: 'fresh-1', status, next_action_at: null, last_attempt_at: null, no_answer_count: 0, callback_at: null, owner: null },
      ]));
      expect(queue.find((l) => l.studentId === 'fresh-1'), `${status} must never be called again`).toBeFalsy();
      expect(totalOpen).toBe(1);
    }
  });
});

describe('Scenario E — the rep and the admin see the same truth, framed differently', () => {
  const claimed = [{
    student_id: 'fresh-1', status: 'interested', next_action_at: null, callback_at: null,
    last_attempt_at: null, no_answer_count: 0, owner: 'priya@careerrai.in',
  }];

  it("another rep's claimed lead is not in your book", async () => {
    const { queue } = await buildCallQueue(db(claimed), 'other@careerrai.in');
    expect(queue.find((l) => l.studentId === 'fresh-1')).toBeFalsy();
  });

  it('the owning rep keeps her own lead', async () => {
    const { queue } = await buildCallQueue(db(claimed), 'priya@careerrai.in');
    expect(queue.find((l) => l.studentId === 'fresh-1')).toBeTruthy();
  });

  it('the admin oversight frame sees every lead, claimed or not', async () => {
    const { queue } = await buildCallQueue(db(claimed));
    expect(queue.find((l) => l.studentId === 'fresh-1')).toBeTruthy();
  });
});

describe('Scenario F — a broken read is never a confident wrong queue', () => {
  it('an unreadable lead state THROWS instead of resurrecting closed leads', async () => {
    // The defect: `outreach` null on error meant converted/not-interested
    // students came back as fresh leads and claimed books lost their owner.
    await expect(buildCallQueue(db([], { outreachFails: true }))).rejects.toThrow(/Could not read the sales queue state/);
  });
});

// ── Reachability: a registered route is not a reachable one ─────────────────

describe('the CRM is reachable, not merely registered', () => {
  const sales = WORKSPACES.find((w) => w.id === 'sales')!;

  it('the Sales workspace lands on the call queue — the CRM, not a signup list', () => {
    expect(sales.href).toBe('/admin/sales');
  });

  it('the tab row is rendered by the LAYOUT, so no page can orphan its siblings', () => {
    // THE bug behind "the CRM is basically not there". The row used to live
    // only in WorkspaceShell, so a workspace whose landing page did not use
    // the shell hid every sibling it had: /admin/sales, /admin/sales-performance
    // and the rep view had ZERO inbound links anywhere in the codebase.
    // Command, Engagement and Analytics were quietly in the same state.
    // Rendering from the nav makes reachability structural, not per-page
    // discipline — this asserts the idea, so renaming anything keeps it true.
    const nav = readFileSync('src/app/admin/admin-nav.tsx', 'utf8');
    expect(nav).toContain('active.tabs');
    expect(nav).toMatch(/href=\{t\.href/);
    // ...and the shell must not render a second, competing row.
    const shell = readFileSync('src/components/admin/workspace-shell.tsx', 'utf8');
    expect(shell).not.toMatch(/ws\.tabs\.map/);
  });

  it('every route the sales workspace claims is a page that exists', () => {
    const missing = sales.tabs
      .filter((t) => t.status !== 'planned')
      .filter((t) => !existsSync(`src/app${t.href}/page.tsx`))
      .map((t) => `${t.label} → ${t.href}`);
    expect(missing, `dead tabs in the CRM:\n  ${missing.join('\n  ')}`).toEqual([]);
  });

  it("the rep's own workspace is one tap from the admin's", () => {
    // The founder could not see what his own sales team sees: /sales was
    // linked from nowhere in /admin, only from inside itself.
    expect(sales.tabs.map((t) => t.href)).toContain('/sales');
    expect(existsSync('src/app/sales/page.tsx')).toBe(true);
  });

  it('both frames are built by the ONE queue authority — never two lists', () => {
    for (const file of ['src/app/admin/sales/page.tsx', 'src/app/sales/page.tsx']) {
      expect(readFileSync(file, 'utf8')).toContain('buildCallQueue');
    }
    // The sales-ready page is a SIGNAL (the count's drill-down), and must not
    // present itself as a second call queue.
    const signal = readFileSync('src/app/admin/sales-queue/page.tsx', 'utf8');
    expect(signal).not.toContain('buildCallQueue');
    expect(signal).toContain('Sales-ready');
  });
});
