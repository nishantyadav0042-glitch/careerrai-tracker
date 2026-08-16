import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

// ── The REAL service worker, executed — not a re-implementation ─────────────
//
// Shreya, 12 Aug: "1 chat appears as multiple notifications. Ideally one chat
// should show as one notification with all the messages collapsed under it."
//
// This suite runs public/sw.js itself inside a stubbed SW global scope and
// dispatches push events at it, asserting the tray behaviour a mentor's phone
// will show: chat pushes with the same `chat-<pair>` tag collapse into one
// entry whose title counts the messages; every other push keeps its own entry;
// the delivery beacon fires for every push regardless of collapsing.

type Shown = { title: string; opts: { tag?: string; data?: Record<string, unknown>; body?: string } };

function bootSw(fetchImpl?: (url: string) => Promise<{ ok: boolean; status?: number }>) {
  const shown: Shown[] = [];
  const beacons: string[] = [];
  const warnings: unknown[][] = [];
  // The OS tray: same tag replaces the previous entry — Web Push semantics.
  // Mutated in place, never reassigned — tests hold a reference to it.
  const tray: { title: string; tag?: string; data?: Record<string, unknown> }[] = [];
  const listeners: Record<string, (e: unknown) => void> = {};

  const registration = {
    showNotification: (title: string, opts: Shown['opts']) => {
      shown.push({ title, opts });
      for (let i = tray.length - 1; i >= 0; i--) if (tray[i].tag === opts.tag) tray.splice(i, 1);
      tray.push({ title, tag: opts.tag, data: opts.data });
      return Promise.resolve();
    },
    getNotifications: ({ tag }: { tag?: string } = {}) =>
      Promise.resolve(tray.filter((n) => !tag || n.tag === tag)),
  };
  const self = {
    addEventListener: (t: string, fn: (e: unknown) => void) => { listeners[t] = fn; },
    registration,
    location: { origin: 'https://careerrai.in' },
    skipWaiting: () => {},
    clients: { claim: () => Promise.resolve(), matchAll: () => Promise.resolve([]), openWindow: () => Promise.resolve() },
  };
  const fetchStub = fetchImpl ?? ((url: string) => { beacons.push(String(url)); return Promise.resolve({ ok: true }); });
  const trackedFetch = fetchImpl
    ? (url: string) => { beacons.push(String(url)); return fetchImpl(url); }
    : fetchStub;
  const src = readFileSync('public/sw.js', 'utf8');
  // Execute the worker with its global names bound to our stubs.
  new Function('self', 'clients', 'fetch', 'caches', 'console', src)(
    self, self.clients, trackedFetch, { keys: () => Promise.resolve([]) },
    { log: () => {}, warn: (...a: unknown[]) => warnings.push(a), error: () => {} },
  );

  const push = async (payload: Record<string, unknown>) => {
    let settled: Promise<unknown> = Promise.resolve();
    listeners['push']({
      data: { json: () => payload },
      waitUntil: (p: Promise<unknown>) => { settled = p; },
    });
    await settled;
  };
  const click = async (data: Record<string, unknown>) => {
    let settled: Promise<unknown> = Promise.resolve();
    listeners['notificationclick']({
      notification: { close: () => {}, data },
      waitUntil: (p: Promise<unknown>) => { settled = p; },
    });
    await settled;
  };
  return { shown, beacons, warnings, tray, push, click };
}

const chatPayload = (body: string, notifId: string) => ({
  title: 'Shreya sent you a message 💬',
  body,
  tag: 'chat-student1-buddy1',
  data: { url: '/buddy/chat/student1', notifId, senderName: 'Shreya', chatCount: undefined },
});

describe('chat notifications collapse to one tray entry (sw.js v8, executed)', () => {
  let sw: ReturnType<typeof bootSw>;
  beforeEach(() => { sw = bootSw(); });

  it('first message shows normally, count starts at 1', async () => {
    await sw.push(chatPayload('hi bhaiya', 'n1'));
    expect(sw.shown).toHaveLength(1);
    expect(sw.shown[0].title).toBe('Shreya sent you a message 💬');
    expect(sw.shown[0].opts.data?.chatCount).toBe(1);
  });

  it('a burst of DMs becomes ONE entry counting up, latest text as body', async () => {
    await sw.push(chatPayload('hi bhaiya', 'n1'));
    await sw.push(chatPayload('mock dena hai kya aaj', 'n2'));
    await sw.push(chatPayload('reply karo na', 'n3'));
    // The tray holds exactly one chat entry…
    const chatEntries = sw.tray.filter((n) => n.tag === 'chat-student1-buddy1');
    expect(chatEntries).toHaveLength(1);
    // …titled with the count, carrying the LATEST message.
    expect(sw.shown[2].title).toBe('Shreya · 3 new messages 💬');
    expect(sw.shown[2].opts.body).toBe('reply karo na');
    expect(sw.shown[2].opts.data?.chatCount).toBe(3);
  });

  it('the delivery beacon fires for EVERY message, collapsed or not', async () => {
    await sw.push(chatPayload('one', 'n1'));
    await sw.push(chatPayload('two', 'n2'));
    // received_at measurement is a Notification-OS non-negotiable — collapsing
    // the tray must never collapse the delivery record.
    expect(sw.beacons.filter((u) => u.includes('/api/push/received'))).toHaveLength(2);
  });

  it('non-chat pushes are untouched — unique tags, own entries, no counting', async () => {
    await sw.push({ title: 'Streak at risk 🔥', body: 'Log today', tag: 'cr-123-abc', data: { url: '/', notifId: 'x1' } });
    await sw.push({ title: 'Mock tomorrow', body: '10am', tag: 'cr-456-def', data: { url: '/', notifId: 'x2' } });
    expect(sw.tray.filter((n) => n.tag?.startsWith('cr-'))).toHaveLength(2);
    expect(sw.shown[1].title).toBe('Mock tomorrow');
  });

  it('a chat message after the entry was dismissed starts counting fresh', async () => {
    await sw.push(chatPayload('one', 'n1'));
    await sw.push(chatPayload('two', 'n2'));
    sw.tray.length = 0; // mentor taps or swipes the notification away
    await sw.push(chatPayload('three', 'n3'));
    expect(sw.shown[2].title).toBe('Shreya sent you a message 💬');
    expect(sw.shown[2].opts.data?.chatCount).toBe(1);
  });
});

// ── Installment 3, Batch 5: the received/click beacons used to be
// `.catch(() => {})` — a failed beacon vanished with zero trace anywhere,
// including the exact moment a beacon is most likely to blip (the device
// waking from Doze to process the push at all). Proven here: the beacon
// retries once, showing the notification / opening the app is NEVER
// blocked by it either way, and a failure that survives the retry is at
// least visible (console.warn), not silent.
describe('push/click beacons — retried, never blocking, never silent (sw.js, executed)', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('a received beacon that fails once succeeds on retry — the notification always shows regardless', async () => {
    let calls = 0;
    const sw = bootSw(() => {
      calls++;
      return calls === 1 ? Promise.resolve({ ok: false, status: 503 }) : Promise.resolve({ ok: true });
    });
    const pushPromise = sw.push({ title: 'Streak at risk', body: 'x', tag: 'cr-1', data: { url: '/', notifId: 'n1' } });
    await vi.advanceTimersByTimeAsync(1500);
    await pushPromise;
    expect(sw.shown).toHaveLength(1); // never blocked on the beacon
    expect(calls).toBe(2); // one retry, not more
    expect(sw.warnings).toHaveLength(0); // recovered — nothing to warn about
  });

  it('a received beacon that fails twice is visible via console.warn, and still never blocks showing the notification', async () => {
    const sw = bootSw(() => Promise.resolve({ ok: false, status: 500 }));
    const pushPromise = sw.push({ title: 'Streak at risk', body: 'x', tag: 'cr-2', data: { url: '/', notifId: 'n2' } });
    await vi.advanceTimersByTimeAsync(1500);
    await pushPromise;
    expect(sw.shown).toHaveLength(1);
    expect(sw.warnings.length).toBeGreaterThan(0);
    expect(String(sw.warnings[0][0])).toContain('received beacon failed');
  });

  it('a click beacon is fired with the tapped notification\'s own id, retried on failure, and never blocks opening the app', async () => {
    let calls = 0;
    const sw = bootSw(() => {
      calls++;
      return calls === 1 ? Promise.resolve({ ok: false, status: 500 }) : Promise.resolve({ ok: true });
    });
    const clickPromise = sw.click({ url: '/student/tracker', notifId: 'n3' });
    await vi.advanceTimersByTimeAsync(1500);
    await clickPromise;
    expect(sw.beacons.filter((u) => u.includes('/api/push/click'))).toHaveLength(2); // original + retry
    expect(calls).toBe(2);
  });
});
