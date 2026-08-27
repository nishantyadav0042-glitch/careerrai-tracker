import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/site';
import { audit } from '@/lib/integration-audit';

// ── Google account connection (mentors) ─────────────────────────────────────
//
// Founder decision, 5 Aug: video sessions move to Google Meet, and a MENTOR
// must connect their Google account before they can book. The student's
// connection is optional — if we know their email they get a real calendar
// invite, and if we don't they still get the link in-app exactly as before.
// That mirrors how Meet actually works: one host creates the conference,
// everyone else only needs the link.
//
// Deliberately NO googleapis package. Token exchange and Calendar are two
// plain REST calls; adding a multi-megabyte SDK to a Next.js edge-ish runtime
// for that is a bad trade. Everything here is fetch.
//
// Incident #3's law still governs: never save a link we cannot verify. If a
// token cannot be refreshed we refuse the booking loudly rather than writing
// a dead session.

const OAUTH_AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const OAUTH_TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://www.googleapis.com/oauth2/v2/userinfo';

/** Calendar write is the minimum that can mint a Meet link. */
export const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/userinfo.email',
].join(' ');

export function googleConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

export function googleRedirectUri(): string {
  return `${SITE_URL}/api/google/callback`;
}

// ── THE `state` PARAMETER, DONE PROPERLY (27 Aug audit, item 11) ────────────
//
// `state` used to carry ONE thing — the path to return the mentor to — and the
// callback used it verbatim:
//
//     const back = decodeURIComponent(params.get('state') || '/buddy/profile');
//     return NextResponse.redirect(new URL(`${back}?google=denied`, request.url));
//
// Two defects, both in the OAuth path itself.
//
// OPEN REDIRECT. `from` on /api/google/connect is attacker-controlled and is
// echoed into `state`. `new URL('https://evil.com?google=denied', base)`
// resolves to the ABSOLUTE url, not a path on our origin — so
// careerrai.in/api/google/connect?from=https://evil.com bounces the visitor
// off-site wearing our domain in the referrer. It does not even need a
// successful consent: the denied branch redirects before any token work, so
// cancelling at Google is enough.
//
// NO CSRF BINDING. `state` exists in OAuth to tie the callback to the browser
// that started the flow. Ours was a return path with no unguessable component,
// so a callback could be replayed into a victim's session — linking an
// ATTACKER's Google account to the victim's CareerRai account, which for a
// mentor means their sessions get created on someone else's calendar.
//
// Both are closed here rather than at the call sites, so the next route that
// starts an OAuth flow cannot reintroduce either one.

/** The only paths a Google round trip may return someone to. */
const RETURN_FALLBACK = '/buddy/home';

/**
 * The cookie tying a callback to the browser that started the flow.
 *
 * Lives here, not in the connect route: an App Router route file may only
 * export the handler and a fixed set of config keys, so exporting a constant
 * from one fails the build.
 */
export const OAUTH_STATE_COOKIE = 'g_oauth_state';

/**
 * A return path that cannot leave this origin.
 *
 * Relative, single-slash, no scheme. `//evil.com` is rejected too — browsers
 * read a protocol-relative URL as absolute, so it is an off-site redirect
 * wearing a path's clothing.
 */
export function safeReturnPath(raw: string | null | undefined, fallback = RETURN_FALLBACK): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  let value = raw;
  // The connect route encodes it once; a hand-built link may not have.
  try { value = decodeURIComponent(raw); } catch { return fallback; }
  if (!value.startsWith('/')) return fallback;
  if (value.startsWith('//')) return fallback;
  if (/[\r\n]/.test(value)) return fallback;
  return value;
}

/** A random, unguessable half for `state`. Node's webcrypto, no dependency. */
export function newStateNonce(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** `state` on the wire: an unguessable nonce, then the return path. */
export function encodeOAuthState(nonce: string, returnPath: string): string {
  return `${nonce}:${safeReturnPath(returnPath)}`;
}

/**
 * Split `state` and check it against the nonce this browser was issued.
 *
 * A mismatch means the callback did not come from a flow this browser started.
 * The return path is re-validated even on success: the nonce proves origin, it
 * does not make the path safe.
 */
export function verifyOAuthState(
  state: string | null | undefined,
  expectedNonce: string | null | undefined,
): { ok: boolean; returnPath: string } {
  const raw = typeof state === 'string' ? state : '';
  const sep = raw.indexOf(':');
  const nonce = sep === -1 ? '' : raw.slice(0, sep);
  const returnPath = safeReturnPath(sep === -1 ? null : raw.slice(sep + 1));
  const ok = !!expectedNonce && nonce.length > 0 && nonce === expectedNonce;
  return { ok, returnPath };
}

/** Where we send a mentor to grant access. `state` carries nonce + return path. */
export function googleConsentUrl(state: string): string {
  const p = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: googleRedirectUri(),
    response_type: 'code',
    scope: GOOGLE_SCOPES,
    // offline + consent is what actually returns a refresh_token. Without
    // BOTH, Google silently returns only an access token on repeat consents
    // and the connection dies in an hour with no obvious cause.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true',
    state,
  });
  return `${OAUTH_AUTH}?${p.toString()}`;
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

async function postToken(body: Record<string, string>): Promise<TokenResponse> {
  const res = await fetch(OAUTH_TOKEN, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body).toString(),
  });
  return (await res.json()) as TokenResponse;
}

/** Exchange the one-time code for tokens and persist them. */
export async function exchangeCodeAndStore(code: string, userId: string): Promise<{ ok: true; email: string | null } | { ok: false; error: string }> {
  const tok = await postToken({
    code,
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    redirect_uri: googleRedirectUri(),
    grant_type: 'authorization_code',
  });
  if (!tok.access_token) {
    return { ok: false, error: tok.error_description || tok.error || 'Google did not return a token.' };
  }
  if (!tok.refresh_token) {
    // Happens when the account already granted access and prompt=consent was
    // dropped. Without a refresh token the connection expires in an hour, so
    // treat it as a failure rather than storing something that will rot.
    return { ok: false, error: 'Google did not return a refresh token — please remove CareerRai from your Google account permissions and connect again.' };
  }

  let email: string | null = null;
  try {
    const me = await fetch(USERINFO, { headers: { Authorization: `Bearer ${tok.access_token}` } });
    if (me.ok) email = ((await me.json()) as { email?: string }).email ?? null;
  } catch { /* email is a nicety, not a requirement */ }

  const admin = createAdminClient();
  const { error } = await admin.from('google_oauth_tokens').upsert({
    user_id: userId,
    refresh_token: tok.refresh_token,
    access_token: tok.access_token,
    token_expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    google_email: email,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'user_id' });
  if (error) return { ok: false, error: error.message };
  return { ok: true, email };
}

/**
 * A usable access token for this user, refreshing when needed.
 * Returns null when they are not connected or the grant was revoked — the
 * caller must then refuse the action, never fall back to something dead.
 */
export async function getAccessToken(userId: string): Promise<string | null> {
  if (!googleConfigured()) return null;
  const admin = createAdminClient();
  const { data } = await admin
    .from('google_oauth_tokens')
    .select('refresh_token, access_token, token_expires_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (!data?.refresh_token) return null;

  // 60s of slack so a token can't expire between this check and the API call.
  const stillValid = data.access_token && data.token_expires_at
    && Date.parse(data.token_expires_at) - Date.now() > 60_000;
  if (stillValid) return data.access_token;

  const tok = await postToken({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    refresh_token: data.refresh_token,
    grant_type: 'refresh_token',
  });
  if (!tok.access_token) {
    // invalid_grant: the user revoked us in their Google account, changed
    // their password, or the token aged out. It will NEVER work again, so
    // retrying is pointless — tear the connection down once, loudly, and let
    // the UI ask for a reconnect.
    await clearGoogleState(userId, 'google.revoked', {
      googleError: tok.error ?? null,
      googleErrorDescription: tok.error_description ?? null,
    });
    return null;
  }
  await admin.from('google_oauth_tokens').update({
    access_token: tok.access_token,
    token_expires_at: new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('user_id', userId);
  return tok.access_token;
}

export async function googleConnection(userId: string): Promise<{ connected: boolean; email: string | null }> {
  const admin = createAdminClient();
  const { data } = await admin
    .from('google_oauth_tokens')
    .select('google_email')
    .eq('user_id', userId)
    .maybeSingle();
  return { connected: !!data, email: data?.google_email ?? null };
}

/**
 * Tear a Google connection down to nothing, in ONE place.
 *
 * Deleting the token alone is the bug that hides for a week: the profile
 * keeps `buddy_meet_url`, so the app still believes it can hand out a Meet
 * link, and every booking cheerfully saves a session pointing at a room on a
 * calendar we can no longer read, write, or cancel. Connection state and room
 * state must die together — so nothing calls the delete directly any more.
 *
 * Used both when a mentor disconnects on purpose and when Google tells us the
 * grant is dead. The only difference is which action gets logged.
 */
export async function clearGoogleState(
  userId: string,
  action: 'google.disconnected' | 'google.revoked' | 'google.account_changed',
  detail: Record<string, unknown> = {},
  actorId?: string | null,
): Promise<void> {
  const admin = createAdminClient();
  await admin.from('google_oauth_tokens').delete().eq('user_id', userId);
  await admin
    .from('profiles')
    .update({
      buddy_meet_url: null,
      buddy_meet_event_id: null,
      buddy_meet_email: null,
      buddy_meet_calendar_id: null,
    })
    .eq('id', userId);
  await audit({ subjectId: userId, actorId, action, detail, ok: true });
}

/**
 * A user-initiated disconnect, which must leave NOTHING behind.
 *
 * The room is deleted from Google FIRST, while the token still exists — after
 * clearGoogleState there is no credential to delete it with and no stored
 * event id to name it, so the conference would live on their calendar forever,
 * still joinable by anyone holding the link, belonging to a mentor who thinks
 * they disconnected.
 *
 * Dynamic import because google-meet imports from this module; a static import
 * would be a cycle.
 */
export async function disconnectGoogle(userId: string, actorId?: string | null): Promise<void> {
  let roomDeleted = false;
  let roomError: string | undefined;
  try {
    const { releaseBuddyRoom } = await import('@/lib/buddy-room');
    ({ deleted: roomDeleted, error: roomError } = await releaseBuddyRoom(userId));
  } catch (e) {
    // Never block a disconnect on the cleanup. A leftover calendar entry is a
    // nuisance; refusing to let someone disconnect is a trust problem.
    roomError = String(e);
    console.error('[google] room release failed during disconnect:', roomError);
  }
  await clearGoogleState(userId, 'google.disconnected', { roomDeleted, roomError: roomError ?? null }, actorId);
}
