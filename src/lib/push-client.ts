'use client';
// The ONE safe way to obtain and persist a push subscription — shared by every
// grant and heal path so they can't drift apart. Born from the 21 July P0: five
// separate call sites each did `getSubscription() → unsubscribe() → subscribe()`,
// which ROTATES the endpoint on every single call. Rotation is the same-day
// death mechanism: the moment you unsubscribe the old endpoint it is dead, and
// if persisting the new one then fails (WebAPK session not ready, a network
// blip) the server is left holding the corpse. This helper reuses a healthy
// subscription instead of rotating it, and never strands one.

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const clean = base64String.trim();
  const padding = '='.repeat((4 - (clean.length % 4)) % 4);
  const base64 = (clean + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

// Does the existing subscription already use our current VAPID key? If we can't
// introspect the key (older Safari exposes it as null), we assume YES — a
// working subscription we can't read is kept, never blindly destroyed, because
// rotating is the dangerous operation.
function keyMatches(sub: PushSubscription, keyBytes: Uint8Array): boolean {
  const existing = sub.options?.applicationServerKey;
  if (!existing) return true;
  const a = new Uint8Array(existing as ArrayBuffer);
  if (a.length !== keyBytes.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== keyBytes[i]) return false;
  return true;
}

// Return a live PushSubscription, REUSING the existing one when it already
// matches our key (the default and overwhelmingly common case). Only rotate
// when forced (a confirmed 410/404 death) or when the key genuinely changed —
// and even then, the old sub is unsubscribed only as we immediately mint a new
// one, so there is no window where the browser holds nothing.
export async function getLiveSubscription(
  reg: ServiceWorkerRegistration,
  publicKey: string,
  opts: { forceRotate?: boolean } = {}
): Promise<PushSubscription> {
  const keyBytes = urlBase64ToUint8Array(publicKey);
  const existing = await reg.pushManager.getSubscription();
  if (existing) {
    if (!opts.forceRotate && keyMatches(existing, keyBytes)) return existing; // reuse — no rotation
    try { await existing.unsubscribe(); } catch { /* ignore */ }
  }
  return reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: keyBytes as unknown as BufferSource,
  });
}

// Persist to the server with ONE retry. A subscription the server never learns
// about is worthless, and a single failed POST used to strand a valid sub while
// the old one lay dead — the exact same-day-death tail. Returns whether the
// server now holds this subscription.
export async function persistSubscription(sub: PushSubscription, context: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), context }),
      });
      if (res.ok) return true;
    } catch { /* fall through to retry */ }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 1200));
  }
  return false;
}
