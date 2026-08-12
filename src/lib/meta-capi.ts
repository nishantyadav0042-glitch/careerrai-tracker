import crypto from 'node:crypto';

// Meta Conversions API (server-side events). More reliable than the browser
// Pixel alone — it isn't blocked by ad-blockers/iOS, and fires from the trusted
// webhook. Entirely inert unless META_CAPI_TOKEN and a pixel id are configured,
// so shipping this is safe. Best-effort: never throws into the caller.
//
// Secrets: META_CAPI_TOKEN is a SERVER-ONLY secret (no NEXT_PUBLIC_ prefix) and
// must only ever live in an env var, never in code.
const GRAPH_VERSION = 'v21.0';

function hashLower(v?: string | null): string | undefined {
  if (!v) return undefined;
  const norm = v.trim().toLowerCase();
  if (!norm) return undefined;
  return crypto.createHash('sha256').update(norm).digest('hex');
}
function hashPhone(v?: string | null): string | undefined {
  if (!v) return undefined;
  const digits = v.replace(/\D/g, ''); // include country code, digits only
  if (!digits) return undefined;
  return crypto.createHash('sha256').update(digits).digest('hex');
}

export interface CapiEvent {
  eventName: string;
  eventId?: string; // share with the browser Pixel event to dedup
  value?: number;
  currency?: string;
  email?: string | null;
  phone?: string | null;
  clientIp?: string | null;
  userAgent?: string | null;
  fbp?: string | null;
  fbc?: string | null;
  actionSource?: 'website' | 'app' | 'other';
}

export async function sendMetaCapiEvent(e: CapiEvent): Promise<void> {
  const token = process.env.META_CAPI_TOKEN;
  const pixelId = process.env.META_PIXEL_ID || process.env.NEXT_PUBLIC_META_PIXEL_ID;
  // Say so when we are inert. This used to `return` in silence, and on 12 Aug
  // that silence cost a whole debugging session: Meta reported 42 leads
  // against 26 real signups and nothing in our logs could answer the first
  // question — did the server even send anything? An unconfigured integration
  // must announce itself, or it looks identical to a working one.
  if (!token || !pixelId) {
    console.warn(`[meta-capi] SKIPPED ${e.eventName} — ${!token ? 'META_CAPI_TOKEN' : 'pixel id'} not set. No server event was sent.`);
    return;
  }

  try {
    const userData: Record<string, unknown> = {};
    const em = hashLower(e.email);
    if (em) userData.em = [em];
    const ph = hashPhone(e.phone);
    if (ph) userData.ph = [ph];
    if (e.clientIp) userData.client_ip_address = e.clientIp;
    if (e.userAgent) userData.client_user_agent = e.userAgent;
    if (e.fbp) userData.fbp = e.fbp;
    if (e.fbc) userData.fbc = e.fbc;

    const body = {
      data: [
        {
          event_name: e.eventName,
          event_time: Math.floor(Date.now() / 1000),
          event_id: e.eventId,
          action_source: e.actionSource ?? 'website',
          user_data: userData,
          custom_data: e.value != null ? { value: e.value, currency: e.currency ?? 'INR' } : undefined,
        },
      ],
    };

    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(token)}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    );
    if (!res.ok) {
      console.error('[meta-capi]', e.eventName, 'HTTP', res.status);
    } else {
      // One line per accepted event, with the dedup id — this is what lets us
      // reconcile "Meta says N" against "we sent M" without guessing.
      console.log(`[meta-capi] sent ${e.eventName} id=${e.eventId ?? 'none'}`);
    }
  } catch (err) {
    console.error('[meta-capi]', (err as Error)?.message);
  }
}
