import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Idempotent POSTs, keyed by an `Idempotency-Key` header.
//
// The case this is really for: a mentor on Indian mobile data taps "Schedule",
// the response is slow, nothing visibly happens, and they tap again. Without a
// key that is two bookings. The database constraints would refuse the second —
// safe, but it reads as a bug, because from where they sit they only tapped
// once and the app said "you already have a meeting with this student."
//
// With a key the second request returns the FIRST one's answer: same session
// id, same link, no error. Standard for payments and bookings, for exactly
// this reason.
//
// Deliberately opt-in per request. A client that sends no key gets today's
// behaviour unchanged, so nothing silently depends on this being present.

const MAX_KEY_LENGTH = 200;

export function idempotencyKey(request: NextRequest): string | null {
  const raw = request.headers.get('idempotency-key')?.trim();
  if (!raw || raw.length > MAX_KEY_LENGTH) return null;
  return raw;
}

/**
 * A previously stored response for this (user, endpoint, key), if any.
 *
 * Scoped by user as well as key: one client's uuid must never be able to read
 * back another client's response, however it was generated.
 */
export async function replayIdempotent(
  userId: string, endpoint: string, key: string | null,
): Promise<NextResponse | null> {
  if (!key) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('idempotency_keys')
    .select('status, response')
    .eq('user_id', userId)
    .eq('endpoint', endpoint)
    .eq('key', key)
    .maybeSingle();
  if (!data) return null;
  return NextResponse.json(
    { ...(data.response as Record<string, unknown>), idempotentReplay: true },
    { status: data.status },
  );
}

/**
 * Remember the answer, so a retry with this key gets it back.
 *
 * Only SUCCESSES are stored. A failure must stay retryable — if Google was
 * down for that one call, the mentor's second tap should be allowed to
 * actually work, not to replay the error forever.
 *
 * Never throws: failing to record idempotency must not fail a booking that
 * already happened.
 */
export async function rememberIdempotent(
  userId: string, endpoint: string, key: string | null,
  status: number, response: Record<string, unknown>,
): Promise<void> {
  if (!key || status >= 400) return;
  try {
    const admin = createAdminClient();
    await admin
      .from('idempotency_keys')
      .upsert({ key, user_id: userId, endpoint, status, response }, { onConflict: 'user_id,endpoint,key' });
  } catch (e) {
    console.error('[idempotency] could not record key:', String(e));
  }
}
