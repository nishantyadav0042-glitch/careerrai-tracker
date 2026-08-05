import { createAdminClient } from '@/lib/supabase/admin';
import { SITE_URL } from '@/lib/site';

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

/** Where we send a mentor to grant access. `state` carries the return path. */
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
    // Revoked or expired grant. Drop the dead row so the UI shows
    // "not connected" and prompts a reconnect, instead of failing silently
    // on every future booking.
    await admin.from('google_oauth_tokens').delete().eq('user_id', userId);
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

export async function disconnectGoogle(userId: string): Promise<void> {
  const admin = createAdminClient();
  await admin.from('google_oauth_tokens').delete().eq('user_id', userId);
}
