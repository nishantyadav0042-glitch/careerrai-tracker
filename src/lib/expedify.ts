// Expedify AI lead hand-off. The instant a brand-new student finishes signing
// up, we POST their contact to Expedify so its AI agent can call them within a
// minute — while intent is at its peak.
//
// Design rules:
//  - Env-gated: completely inert until EXPEDIFY_WEBHOOK_URL is set, so it ships
//    safely and turns on the moment you add the env var in Vercel.
//  - Never throws / never blocks: a signup must NEVER fail because the lead
//    hand-off hiccuped. Errors are logged, swallowed, and the call is fired via
//    `after()` so it runs post-response without slowing the student down.
//  - Timeout-guarded so a slow/dead Expedify endpoint can't hang the function.
//
// Field names below are our best-guess defaults — tell me Expedify's exact
// expected payload (field names + phone format + auth header) and I'll match it.
export interface ExpedifyLead {
  name: string;
  phone: string;            // E.164, e.g. +919876543210
  email?: string | null;
  source?: string | null;   // 'self_serve' | 'allowlist'
  dreamCollege?: string | null;
  targetPercentile?: number | null;
}

export async function sendExpedifyLead(lead: ExpedifyLead): Promise<void> {
  const url = process.env.EXPEDIFY_WEBHOOK_URL;
  if (!url) return; // not configured — no-op

  const key = process.env.EXPEDIFY_API_KEY;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify({
        name: lead.name,
        phone: lead.phone,
        email: lead.email ?? undefined,
        source: lead.source ?? 'careerrai',
        dream_college: lead.dreamCollege ?? undefined,
        target_percentile: lead.targetPercentile ?? undefined,
      }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) {
      console.error(`[expedify] lead hand-off HTTP ${res.status}:`, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[expedify] lead hand-off failed:', err);
  }
}
