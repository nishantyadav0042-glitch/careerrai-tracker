import { describe, it, expect } from 'vitest';
import { mutatePlanTasks, MAX_PLAN_MUTATE_ATTEMPTS, type PlanRow } from './plan-mutate';

// ── Two edits, both survive ─────────────────────────────────────────────────
//
// Founder, 14 Aug: "student action → persistence → study plan state
// corruption. That directly violates the backbone requirement."
//
// He is right that this is P1, not a footnote. add-block and busy-day both
// read the JSONB task array, change it in memory and write the whole array
// back. Without a version check the second writer overwrites the first and
// nothing anywhere reports it.
//
// These tests drive a fake PostgREST that models exactly the behaviour the
// fix depends on: an UPDATE filtered on a stale version matches zero rows.

interface FakeRow { tasks: unknown[]; est_minutes: number; swapped_out: unknown; version: number }

/**
 * Minimal stand-in for the supabase client, with a hook that lets a test
 * mutate the row BETWEEN the read and the write — which is precisely the
 * interleaving that loses an edit in the real world.
 */
function fakeAdmin(row: FakeRow, opts: { onBeforeWrite?: () => void; failRead?: boolean; missing?: boolean } = {}) {
  let pendingVersionFilter: number | null = null;
  const api = {
    from() { return api; },
    select() { return api; },
    eq(col: string, val: unknown) {
      if (col === 'version') pendingVersionFilter = val as number;
      return api;
    },
    async maybeSingle() {
      if (opts.failRead) return { data: null, error: { message: 'boom' } };
      if (opts.missing) return { data: null, error: null };
      return { data: { ...row }, error: null };
    },
    update(patch: Record<string, unknown>) {
      // The concurrent writer lands here, after our read and before our write.
      opts.onBeforeWrite?.();
      opts.onBeforeWrite = undefined; // only interfere once
      const wanted = pendingVersionFilter;
      pendingVersionFilter = null;
      const chain = {
        eq(col: string, val: unknown) {
          if (col === 'version') { (chain as unknown as { v: number }).v = val as number; }
          return chain;
        },
        async select() {
          const v = (chain as unknown as { v?: number }).v ?? wanted;
          if (v !== row.version) return { data: [], error: null }; // lost the race
          Object.assign(row, patch);
          return { data: [{ version: row.version }], error: null };
        },
      };
      return chain;
    },
  };
  return api;
}

const appendTask = (id: string) => (r: PlanRow) => ({
  ok: true as const,
  value: id,
  patch: { tasks: [...r.tasks, { id }], est_minutes: r.est_minutes + 30 },
});

describe('a losing write is retried, never dropped', () => {
  it('both concurrent edits end up in the plan', async () => {
    const row: FakeRow = { tasks: [{ id: 'a' }], est_minutes: 60, swapped_out: [], version: 0 };

    // While our mutator is deciding, a second request writes and bumps the
    // version. Without CAS our write would silently erase it.
    const admin = fakeAdmin(row, {
      onBeforeWrite: () => {
        row.tasks = [...row.tasks, { id: 'other' }];
        row.est_minutes += 30;
        row.version += 1;
      },
    });

    const res = await mutatePlanTasks(admin, 'stu', '2026-08-14', appendTask('mine'));
    expect(res.ok).toBe(true);

    const ids = (row.tasks as { id: string }[]).map((t) => t.id);
    expect(ids).toContain('other'); // the concurrent edit survived
    expect(ids).toContain('mine');  // and so did ours
    expect(row.est_minutes).toBe(120); // 60 + 30 + 30 — no arithmetic lost
    expect(row.version).toBe(2);
  });

  it('the retry re-decides from FRESH state, so est_minutes can never drift', async () => {
    // The original add-block bug: est_minutes was computed from the stale read,
    // so the row's stated minutes stopped matching the tasks it held.
    const row: FakeRow = { tasks: [], est_minutes: 0, swapped_out: [], version: 0 };
    const admin = fakeAdmin(row, {
      onBeforeWrite: () => { row.tasks = [{ id: 'x' }]; row.est_minutes = 30; row.version += 1; },
    });
    await mutatePlanTasks(admin, 'stu', '2026-08-14', appendTask('y'));
    const total = (row.tasks as unknown[]).length * 30;
    expect(row.est_minutes).toBe(total);
  });
});

describe('it fails loudly rather than corrupting', () => {
  it('gives up with 409 when it keeps losing, instead of looping forever', async () => {
    const row: FakeRow = { tasks: [], est_minutes: 0, swapped_out: [], version: 0 };
    // A writer that ALWAYS beats us: bump the version before every write.
    const admin = fakeAdmin(row, {});
    const original = admin.update.bind(admin);
    let attempts = 0;
    admin.update = ((patch: Record<string, unknown>) => { attempts++; row.version += 1; return original(patch); }) as typeof admin.update;

    const res = await mutatePlanTasks(admin, 'stu', '2026-08-14', appendTask('z'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(409);
    expect(attempts).toBe(MAX_PLAN_MUTATE_ATTEMPTS);
  });

  it('a read error is never mistaken for "no plan"', async () => {
    // Treating a transient failure as absence is how this codebase previously
    // rewrote a student's coverage downward.
    const res = await mutatePlanTasks(fakeAdmin({ tasks: [], est_minutes: 0, swapped_out: [], version: 0 }, { failRead: true }), 's', 'd', appendTask('a'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(500);
  });

  it('no plan for today is a clean 404', async () => {
    const res = await mutatePlanTasks(fakeAdmin({ tasks: [], est_minutes: 0, swapped_out: [], version: 0 }, { missing: true }), 's', 'd', appendTask('a'));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(404);
  });

  it('a mutator refusal is returned as-is and writes nothing', async () => {
    const row: FakeRow = { tasks: [{ id: 'a' }], est_minutes: 30, swapped_out: [], version: 0 };
    const res = await mutatePlanTasks(fakeAdmin(row), 's', 'd', () => ({ ok: false, status: 429, error: 'full day' }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.status).toBe(429);
    expect(row.version).toBe(0);
    expect(row.tasks).toHaveLength(1);
  });
});

describe('the mutating routes go through it', () => {
  it('add-block and busy-day both use compare-and-swap', async () => {
    const { readFileSync } = await import('node:fs');
    for (const f of ['src/app/api/routine/add-block/route.ts', 'src/app/api/routine/busy-day/route.ts']) {
      expect(readFileSync(f, 'utf8'), f).toContain('mutatePlanTasks');
    }
  });

  it('no route writes daily_routines.tasks outside the helper', async () => {
    const { readFileSync, readdirSync } = await import('node:fs');
    const dir = 'src/app/api/routine';
    for (const name of readdirSync(dir)) {
      const path = `${dir}/${name}/route.ts`;
      let src: string;
      try { src = readFileSync(path, 'utf8'); } catch { continue; }
      // Scoped to the object literal being written. The old lazy `[\s\S]*?`
      // spanned the WHOLE file, so any `.update({ ... })` anywhere matched as
      // soon as a later line happened to contain `tasks:` — which a function
      // signature does. It flagged complete-task for writing
      // routine_task_completions.confidence, a different table and column
      // entirely. Same rule, no false positive.
      if (!/\.update\(\s*\{[^}]*\btasks\s*:/.test(src)) continue;
      expect(src, `${path} mutates tasks without plan-mutate`).toContain('mutatePlanTasks');
    }
  });
});
