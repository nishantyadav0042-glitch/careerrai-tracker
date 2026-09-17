import { describe, it, expect, vi } from 'vitest';
import {
  isNetworkFailure,
  retryOnNetworkFailure,
  retryFetch,
  NETWORK_WRITE_MESSAGE,
  type WriteOutcome,
} from './write-retry';

/** No real waiting anywhere in this suite. */
const noSleep = () => Promise.resolve();

describe('isNetworkFailure — status, never the message', () => {
  it('is true for postgrest\'s rejected-fetch shape (status 0)', () => {
    // Exactly what @supabase/postgrest-js returns when fetch rejects.
    expect(isNetworkFailure({
      error: { message: 'TypeError: Load failed', details: '', hint: '', code: '' },
      status: 0,
    })).toBe(true);
  });

  it('is true regardless of how the engine words it', () => {
    // The three real messages from the three engines our students use. If this
    // ever starts branching on text instead of status, two of these break.
    for (const message of [
      'TypeError: Load failed',                                   // Safari / iOS
      'TypeError: Failed to fetch',                               // Chrome
      'TypeError: NetworkError when attempting to fetch resource.', // Firefox
    ]) {
      expect(isNetworkFailure({ error: { message }, status: 0 })).toBe(true);
    }
  });

  it('is FALSE for a server verdict — the request arrived and was refused', () => {
    // Retrying any of these just reprints the same answer more slowly.
    expect(isNetworkFailure({
      error: { message: 'permission denied for function is_admin', code: '42501' },
      status: 403,
    })).toBe(false);
    expect(isNetworkFailure({
      error: { message: 'null value in column "full_name" violates not-null constraint', code: '23502' },
      status: 400,
    })).toBe(false);
    expect(isNetworkFailure({ error: { message: 'server blew up' }, status: 500 })).toBe(false);
  });

  it('is false on success, including a success that happens to carry status 0', () => {
    expect(isNetworkFailure({ error: null, status: 204 })).toBe(false);
    expect(isNetworkFailure({ error: null, status: 0 })).toBe(false);
  });

  it('is false when status is absent — an unknown shape is not assumed retryable', () => {
    expect(isNetworkFailure({ error: { message: 'something' } })).toBe(false);
    expect(isNetworkFailure({ error: { message: 'x' }, status: null })).toBe(false);
  });
});

describe('retryOnNetworkFailure', () => {
  const netFail = (): WriteOutcome => ({ error: { message: 'TypeError: Load failed' }, status: 0 });
  const ok = (): WriteOutcome => ({ error: null, status: 204 });

  it('returns immediately on success without retrying', async () => {
    const run = vi.fn().mockResolvedValue(ok());
    const out = await retryOnNetworkFailure(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(1);
    expect(out.error).toBeNull();
  });

  it('recovers a momentary radio drop — the student never sees anything', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(netFail())
      .mockResolvedValueOnce(ok());
    const out = await retryOnNetworkFailure(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(2);
    expect(out.error).toBeNull();
  });

  it('recovers on the last permitted attempt', async () => {
    const run = vi.fn()
      .mockResolvedValueOnce(netFail())
      .mockResolvedValueOnce(netFail())
      .mockResolvedValueOnce(ok());
    const out = await retryOnNetworkFailure(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(3);
    expect(out.error).toBeNull();
  });

  it('gives up after the bounded number of attempts and returns the last failure', async () => {
    const run = vi.fn().mockResolvedValue(netFail());
    const out = await retryOnNetworkFailure(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(3);
    expect(isNetworkFailure(out)).toBe(true);
  });

  it('NEVER retries a server refusal', async () => {
    // The point of the whole file. A 403 is an answer; asking again is rude to
    // the student's battery and their time, and hides the real cause.
    const refusal = { error: { message: 'permission denied', code: '42501' }, status: 403 };
    const run = vi.fn().mockResolvedValue(refusal);
    const out = await retryOnNetworkFailure(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(1);
    expect(out.status).toBe(403);
  });

  it('waits between attempts, with backoff, and never before the first', async () => {
    const waits: number[] = [];
    const run = vi.fn().mockResolvedValue(netFail());
    await retryOnNetworkFailure(run, {
      sleep: async (ms) => { waits.push(ms); },
    });
    // Two gaps for three attempts — not three.
    expect(waits).toEqual([400, 1200]);
  });

  it('honours a custom attempt count', async () => {
    const run = vi.fn().mockResolvedValue(netFail());
    await retryOnNetworkFailure(run, { attempts: 5, delaysMs: [1, 1, 1, 1], sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(5);
  });

  it('attempts:1 disables retrying entirely', async () => {
    const run = vi.fn().mockResolvedValue(netFail());
    await retryOnNetworkFailure(run, { attempts: 1, sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('NETWORK_WRITE_MESSAGE — what a student is allowed to read', () => {
  it('never leaks a driver or engine error name', () => {
    // The exact strings that must never reach a student's screen again.
    for (const leak of ['TypeError', 'Load failed', 'Failed to fetch', 'postgrest', 'fetch', 'undefined', 'null']) {
      expect(NETWORK_WRITE_MESSAGE.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it('tells the student their work is safe — the part that stops them abandoning', () => {
    expect(NETWORK_WRITE_MESSAGE.toLowerCase()).toContain('saved');
  });

  it('says what to do next', () => {
    expect(NETWORK_WRITE_MESSAGE.toLowerCase()).toContain('connection');
  });
});

describe('retryFetch — the same rule where fetch draws the line differently', () => {
  const rejected = () => Promise.reject(new TypeError('Load failed'));
  const responded = (status: number) => Promise.resolve({ ok: status < 400, status } as Response);

  it('returns the first successful response without retrying', async () => {
    const run = vi.fn().mockImplementation(() => responded(200));
    const res = await retryFetch(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(200);
  });

  it('recovers a rejection that resolves on a later attempt', async () => {
    const run = vi.fn()
      .mockImplementationOnce(rejected)
      .mockImplementationOnce(() => responded(200));
    const res = await retryFetch(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(2);
    expect(res.status).toBe(200);
  });

  it('does NOT retry a 500 — fetch resolving means the server answered', async () => {
    // The whole difference from the postgrest case. A 500 is a verdict that
    // arrived, so it goes back to the caller on the first attempt.
    const run = vi.fn().mockImplementation(() => responded(500));
    const res = await retryFetch(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(1);
    expect(res.status).toBe(500);
  });

  it('does not retry a 4xx either', async () => {
    const run = vi.fn().mockImplementation(() => responded(400));
    await retryFetch(run, { sleep: noSleep });
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rethrows the last rejection once attempts are spent, so the caller still catches', async () => {
    const run = vi.fn().mockImplementation(rejected);
    await expect(retryFetch(run, { sleep: noSleep })).rejects.toThrow('Load failed');
    expect(run).toHaveBeenCalledTimes(3);
  });

  it('waits with backoff between attempts and never before the first', async () => {
    const waits: number[] = [];
    const run = vi.fn().mockImplementation(rejected);
    await retryFetch(run, { sleep: async (ms) => { waits.push(ms); } }).catch(() => {});
    expect(waits).toEqual([400, 1200]);
  });
});
