import { connect, constants as h2 } from 'node:http2';
import { createPrivateKey, sign as cryptoSign } from 'node:crypto';
import { getServerConfig } from '@/lib/server-config';

// ── THE APNs TRANSPORT — the second wire out of sendToEndpoint ──────────────
//
// Task #78. The App Store build is a WKWebView wrapper, and Apple grants Web
// Push only to Safari and Home Screen PWAs — never to a third-party app's
// embedded web view. So the 211 students inside that app can be reached by
// exactly one Apple-supported mechanism: native APNs. This module is the
// server half of that: it speaks APNs' HTTP/2 protocol directly.
//
// ── DO NOT CALL THIS DIRECTLY ───────────────────────────────────────────────
// Exactly like web-push, this is a transport, not a send API. The only caller
// is push.ts's sendToEndpoint(), behind the provider branch that already
// existed — every product surface still goes through notification-os
// dispatch(), and a source-scan guard (apns-transport.behaviour.test.ts)
// fails the build if any other file imports sendApnsToToken.
//
// DELIBERATELY ZERO NEW DEPENDENCIES. node:http2 speaks the protocol APNs
// requires (plain fetch/undici cannot — APNs is HTTP/2-only), and node:crypto
// signs the ES256 provider JWT. The popular apns libraries wrap exactly these
// two modules; wrapping them ourselves keeps the dependency surface at zero
// and the failure semantics in one readable place.
//
// CREDENTIALS come from server_config (getServerConfig), the same
// DB-authoritative pattern the VAPID keypair already uses — never from a file
// in this repo, never from client-visible env. The .p8 private key's PEM body
// lives in the APNS_AUTH_KEY row; rotating it is a DB update, no redeploy.
//
//   APNS_TEAM_ID   — 10-char Apple Developer team id
//   APNS_KEY_ID    — 10-char id of the APNs auth key
//   APNS_AUTH_KEY  — the .p8 file's PEM contents (BEGIN PRIVATE KEY block)
//   APNS_TOPIC     — the iOS app's bundle identifier
//   APNS_ENV       — 'production' (default) or 'sandbox' (Xcode debug builds)
//
// Until all four required rows exist, isApnsConfigured() is false and
// sendToEndpoint records 'apns_not_configured' — exactly the dormant
// behaviour the pre-APNs branch had, under a reason that says why.

export interface ApnsSendResult { ok: boolean; reason?: string; terminal?: boolean }

/**
 * What an APNs response MEANS for the endpoint — pure, so the mapping that
 * decides whether a device gets revoked is testable without a network.
 *
 * TERMINAL (this token is dead, revoke this one endpoint):
 *   410 Unregistered           — the app was deleted from the device
 *   400 BadDeviceToken         — not a token this environment ever issued
 *   400 DeviceTokenNotForTopic — a token for some other app entirely
 *
 * NOT terminal, and named precisely rather than lumped as 'failed':
 *   403 — OUR provider credential is wrong (bad/expired JWT, wrong key).
 *         Revoking student devices over our own misconfiguration would be
 *         the 410-nulls-the-student bug reborn one layer down.
 *   429 / 5xx / anything else — retry-able weather.
 */
export function classifyApnsResponse(status: number, reason: string | null): ApnsSendResult {
  if (status === 200) return { ok: true };
  const terminal =
    status === 410 ||
    (status === 400 && (reason === 'BadDeviceToken' || reason === 'DeviceTokenNotForTopic'));
  return {
    ok: false,
    reason: `apns_${status}${reason ? `_${reason}` : ''}`,
    terminal,
  };
}

/** An APNs device token is opaque hex. Bounds are generous on purpose —
 *  Apple documents the format as variable-length and warns against assuming
 *  the historical 64 chars. */
export function isValidApnsToken(token: unknown): token is string {
  return typeof token === 'string' && /^[0-9a-f]{32,200}$/i.test(token);
}

// Provider JWT, cached per worker. Apple rejects tokens older than 60 minutes
// and throttles refreshes more frequent than ~20; 45 sits safely inside both.
let jwtCache: { token: string; mintedAt: number } | null = null;
const JWT_MAX_AGE_MS = 45 * 60 * 1000;

function mintJwt(teamId: string, keyId: string, p8Pem: string): string {
  if (jwtCache && Date.now() - jwtCache.mintedAt < JWT_MAX_AGE_MS) return jwtCache.token;
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'ES256', kid: keyId })}.${b64({ iss: teamId, iat: Math.floor(Date.now() / 1000) })}`;
  // ieee-p1363 is the raw r||s signature JOSE requires — DER (the default)
  // produces a JWT Apple rejects with 403 InvalidProviderToken.
  const signature = cryptoSign('sha256', Buffer.from(unsigned), {
    key: createPrivateKey(p8Pem),
    dsaEncoding: 'ieee-p1363',
  }).toString('base64url');
  jwtCache = { token: `${unsigned}.${signature}`, mintedAt: Date.now() };
  return jwtCache.token;
}

async function apnsConfig() {
  const [teamId, keyId, authKey, topic, env] = await Promise.all([
    getServerConfig('APNS_TEAM_ID', 'APNS_TEAM_ID'),
    getServerConfig('APNS_KEY_ID', 'APNS_KEY_ID'),
    getServerConfig('APNS_AUTH_KEY', 'APNS_AUTH_KEY'),
    getServerConfig('APNS_TOPIC', 'APNS_TOPIC'),
    getServerConfig('APNS_ENV', 'APNS_ENV'),
  ]);
  if (!teamId || !keyId || !authKey || !topic) return null;
  return { teamId, keyId, authKey, topic, env: env === 'sandbox' ? 'sandbox' : 'production' };
}

export async function isApnsConfigured(): Promise<boolean> {
  return (await apnsConfig()) !== null;
}

/**
 * One alert to one device token. Mirrors webpush.sendNotification's contract
 * as sendToEndpoint consumes it: resolves with a classified result, never
 * throws to the caller, never hangs (10s hard timeout — a wedged push
 * connection must not stall a cron batch).
 */
export async function sendApnsToToken(
  token: string,
  payload: { title: string; body: string; url?: string; notifId: string; endpointId?: string | null },
): Promise<ApnsSendResult> {
  const cfg = await apnsConfig();
  if (!cfg) return { ok: false, reason: 'apns_not_configured', terminal: false };

  let jwt: string;
  try {
    jwt = mintJwt(cfg.teamId, cfg.keyId, cfg.authKey);
  } catch (err) {
    // A malformed key is OUR problem — surfaced, never terminal for a device.
    console.error('[apns] provider JWT mint failed:', err);
    return { ok: false, reason: 'apns_jwt_mint_failed', terminal: false };
  }

  const host = cfg.env === 'sandbox'
    ? 'https://api.sandbox.push.apple.com'
    : 'https://api.push.apple.com';

  // The same three facts the web-push payload carries ride along OUTSIDE aps,
  // where the native app can read them: notifId for the (future) receipt and
  // click reports, url for the deep link, endpointId for per-device
  // attribution — the exact wire task #79 built for the service worker.
  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: 'default' },
    notifId: payload.notifId,
    url: payload.url ?? '/',
    ...(payload.endpointId ? { endpointId: payload.endpointId } : {}),
  });

  return new Promise<ApnsSendResult>((resolve) => {
    let settled = false;
    const done = (r: ApnsSendResult) => { if (!settled) { settled = true; resolve(r); } };

    const session = connect(host);
    const timer = setTimeout(() => {
      session.close();
      done({ ok: false, reason: 'apns_timeout', terminal: false });
    }, 10_000);

    session.on('error', (err) => {
      clearTimeout(timer);
      console.error('[apns] session error:', err);
      done({ ok: false, reason: 'apns_connect_failed', terminal: false });
    });

    const req = session.request({
      [h2.HTTP2_HEADER_METHOD]: 'POST',
      [h2.HTTP2_HEADER_PATH]: `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': cfg.topic,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      // Same 24h shelf life the web-push TTL uses: a reminder that could not
      // be delivered (device off) expires instead of arriving a day late.
      'apns-expiration': String(Math.floor(Date.now() / 1000) + 24 * 60 * 60),
      'content-type': 'application/json',
    });

    let status = 0;
    let responseBody = '';
    req.on('response', (headers) => { status = Number(headers[h2.HTTP2_HEADER_STATUS] ?? 0); });
    req.on('data', (chunk) => { responseBody += chunk; });
    req.on('end', () => {
      clearTimeout(timer);
      session.close();
      let reason: string | null = null;
      try { reason = responseBody ? (JSON.parse(responseBody).reason ?? null) : null; } catch { /* body optional */ }
      done(classifyApnsResponse(status, reason));
    });
    req.on('error', (err) => {
      clearTimeout(timer);
      session.close();
      console.error('[apns] request error:', err);
      done({ ok: false, reason: 'apns_request_failed', terminal: false });
    });

    req.end(body);
  });
}
