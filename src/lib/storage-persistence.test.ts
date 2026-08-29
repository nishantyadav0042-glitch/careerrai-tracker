import { describe, it, expect, vi } from 'vitest';
import { ensurePersistentStorage, type StorageManagerLike } from './storage-persistence';

// ── THE MEASUREMENT MUST SURVIVE BEING WRONG ────────────────────────────────
//
// This helper exists to test a hypothesis (an installed PWA's storage was
// evicted), not to confirm one. So the property that matters most is that
// `persistedBefore` reports what it FOUND, never what we hoped: if browsers
// come back already-persistent, the eviction theory is dead and this is the
// number that kills it. A helper that quietly reported success would hide the
// refutation and we would keep chasing the wrong cause.

const sm = (o: Partial<StorageManagerLike>): StorageManagerLike => ({
  persisted: async () => false,
  persist: async () => true,
  ...o,
}) as StorageManagerLike;

describe('asking for persistent storage', () => {
  it('does not ask when storage is already persistent', async () => {
    const persist = vi.fn(async () => true);
    const r = await ensurePersistentStorage(sm({ persisted: async () => true, persist }));
    expect(r.persistedBefore).toBe(true);
    expect(r.requested).toBe(false);
    expect(r.persistedNow).toBe(true);
    // A needless persist() can surface a permission prompt in some browsers,
    // and telemetry must never interrupt a student mid-study.
    expect(persist).not.toHaveBeenCalled();
  });

  it('asks when storage is evictable, and reports that it had to', async () => {
    const persist = vi.fn(async () => true);
    const r = await ensurePersistentStorage(sm({ persisted: async () => false, persist }));
    expect(r.persistedBefore).toBe(false);   // ← the finding
    expect(r.requested).toBe(true);
    expect(r.persistedNow).toBe(true);
    expect(persist).toHaveBeenCalledOnce();
  });

  it('a REFUSED request is reported as refused, never as success', async () => {
    const r = await ensurePersistentStorage(sm({ persisted: async () => false, persist: async () => false }));
    expect(r.requested).toBe(true);
    expect(r.persistedNow).toBe(false);
  });

  it('reports quota and usage in whole MB when the browser offers them', async () => {
    const r = await ensurePersistentStorage(sm({
      estimate: async () => ({ quota: 1_048_576 * 512, usage: 1_048_576 * 3 }),
    }));
    expect(r.quotaMb).toBe(512);
    expect(r.usageMb).toBe(3);
  });

  it('a broken estimate() still yields the verdict', async () => {
    const r = await ensurePersistentStorage(sm({
      persisted: async () => false,
      estimate: async () => { throw new Error('nope'); },
    }));
    expect(r.persistedNow).toBe(true);
    expect(r.quotaMb).toBeUndefined();
  });
});

describe('UNKNOWN rather than a comforting default', () => {
  it('no Storage API at all is unsupported, not "fine"', async () => {
    for (const absent of [null, undefined, {} as StorageManagerLike]) {
      const r = await ensurePersistentStorage(absent);
      expect(r.supported).toBe(false);
      // Crucially NOT persistedNow: true. Reporting an unmeasured browser as
      // protected is how a fix gets believed without evidence.
      expect(r.persistedNow).toBe(false);
    }
  });

  it('a throwing storage manager degrades to unsupported and never rejects', async () => {
    const r = await ensurePersistentStorage(sm({ persisted: async () => { throw new Error('boom'); } }));
    expect(r.supported).toBe(false);
    expect(r.persistedNow).toBe(false);
  });

  it('never throws, whatever the browser does', async () => {
    const hostile = { persisted: () => { throw new Error('sync throw'); }, persist: async () => true };
    await expect(ensurePersistentStorage(hostile as unknown as StorageManagerLike)).resolves.toBeTruthy();
  });
});
