import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextResponse } from 'next/server';

interface FakeRow {
  id: string;
  cron_path: string;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  result: unknown;
  fatal_error: string | null;
}

let rows: FakeRow[] = [];
let nextId = 1;

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table !== 'cron_runs') throw new Error(`unexpected table ${table}`);
      return {
        insert: (row: Partial<FakeRow>) => {
          const created: FakeRow = {
            id: `run-${nextId++}`, cron_path: row.cron_path as string,
            started_at: new Date().toISOString(), completed_at: null,
            duration_ms: null, result: null, fatal_error: null,
          };
          rows.push(created);
          return { select: () => ({ single: async () => ({ data: { id: created.id } }) }) };
        },
        update: (patch: Partial<FakeRow>) => ({
          eq: (_col: string, id: string) => {
            const r = rows.find((x) => x.id === id);
            if (r) Object.assign(r, patch);
            return Promise.resolve({ error: null });
          },
        }),
      };
    },
  }),
}));

import { withCronTracking } from './cron-run-tracker';

beforeEach(() => {
  rows = [];
  nextId = 1;
});

describe('withCronTracking — a cron that ran must be distinguishable from one that never fired', () => {
  it('writes a row on entry, before the handler runs at all', async () => {
    let rowExistedDuringHandler = false;
    await withCronTracking('/api/cron/test', async () => {
      rowExistedDuringHandler = rows.length === 1 && rows[0].completed_at == null;
      return NextResponse.json({ ok: true });
    });
    expect(rowExistedDuringHandler).toBe(true);
  });

  it('a successful run captures the handler\'s own JSON body and a real duration', async () => {
    await withCronTracking('/api/cron/decision-engine', async () =>
      NextResponse.json({ notified: 3, silent: 5, dedupSuppressed: 1, total: 9 })
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].completed_at).not.toBeNull();
    expect(rows[0].duration_ms).not.toBeNull();
    expect(rows[0].result).toEqual({ notified: 3, silent: 5, dedupSuppressed: 1, total: 9 });
    expect(rows[0].fatal_error).toBeNull();
  });

  it('a run that finds zero eligible students still completes with a real result — not indistinguishable from never running', async () => {
    await withCronTracking('/api/cron/decision-engine', async () =>
      NextResponse.json({ notified: 0, total: 0 })
    );
    expect(rows[0].completed_at).not.toBeNull();
    expect(rows[0].result).toEqual({ notified: 0, total: 0 });
  });

  it('a thrown error is recorded as fatal_error, completed_at still stamped, and the throw still propagates', async () => {
    await expect(
      withCronTracking('/api/cron/broken', async () => { throw new Error('boom'); })
    ).rejects.toThrow('boom');
    expect(rows[0].completed_at).not.toBeNull();
    expect(rows[0].fatal_error).toContain('boom');
    expect(rows[0].result).toBeNull();
  });

  it('the response returned to the caller is unmodified — cloning does not consume the real body', async () => {
    const response = await withCronTracking('/api/cron/test', async () =>
      NextResponse.json({ eligible: 7 })
    );
    expect(await response.json()).toEqual({ eligible: 7 });
  });
});
