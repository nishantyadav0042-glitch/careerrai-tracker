import { createAdminClient } from '@/lib/supabase/admin';
import type { StudentBrief } from '@/lib/student-brief';

// Expedify AI lead hand-off. The instant a brand-new student finishes signup, we
// POST their full brief to Expedify so its AI agent can call them within a
// minute — already knowing who they are, what they want, and their strengths &
// weaknesses (see student-brief). The outcome (sent | failed) is written back to
// the profile so the lead card can show a call-triggered ✓/✗.
//
// Design rules:
//  - Env-gated: completely inert until EXPEDIFY_WEBHOOK_URL is set.
//  - Never throws / never blocks signup: fired via after(), timeout-guarded,
//    errors logged and swallowed.
//
// Auth: X-API-Key header, endpoint POST {base}/add/contacts (per Expedify docs).
export interface ExpedifyLead {
  studentId?: string;       // omit for test fires — skips the profile status write
  name: string;
  phone: string;            // E.164, e.g. +919876543210
  email?: string | null;
  source?: string | null;   // 'self_serve' | 'allowlist' | 'test'
  // Contact type for Expedify's routing: a brand-new signup vs a follow-up
  // (re-engagement of an existing student). Defaults to 'new_lead'.
  leadType?: 'new_lead' | 'follow_up';
  brief: StudentBrief;
}

// Returned so the admin test endpoint can show exactly what Expedify said;
// production signup callers ignore it.
export interface ExpedifyResult {
  configured: boolean;      // false = env vars missing, nothing sent
  ok: boolean;
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
}

export async function sendExpedifyLead(lead: ExpedifyLead): Promise<ExpedifyResult> {
  const url = process.env.EXPEDIFY_WEBHOOK_URL;
  if (!url) return { configured: false, ok: false, httpStatus: null, responseBody: null, error: 'EXPEDIFY_WEBHOOK_URL not set' };

  const key = process.env.EXPEDIFY_API_KEY;
  const b = lead.brief;
  const result: ExpedifyResult = { configured: true, ok: false, httpStatus: null, responseBody: null, error: null };
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        // Expedify auth: X-API-Key header (per their API docs), not Bearer.
        'Content-Type': 'application/json',
        ...(key ? { 'X-API-Key': key } : {}),
      },
      body: JSON.stringify({
        name: lead.name,
        phone: lead.phone,
        // Expedify requires `email` (422 without it), but our signups are
        // phone-based and usually have none — send a synthetic, clearly-fake
        // placeholder derived from the phone so the contact always validates.
        email: lead.email ?? `${lead.phone.replace(/\D/g, '')}@noemail.careerrai.app`,
        source: lead.source ?? 'careerrai',
        lead_type: lead.leadType ?? 'new_lead',
        // The brief the AI agent should use on the call:
        summary: b.summary,
        attempt: b.attempt ?? undefined,
        target_percentile: b.targetPercentile ?? undefined,
        dream_colleges: b.dreamColleges.length ? b.dreamColleges : undefined,
        hours_per_day: b.hoursPerDay ?? undefined,
        coaching: b.coaching ?? undefined,
        wants_mentor: b.wantsMentor ?? undefined,
        target_date: b.targetDate ?? undefined,
        pain_points: b.painPoints.length ? b.painPoints : undefined,
        strongest_section: b.strongestSection ?? undefined,
        weakest_section: b.weakestSection ?? undefined,
        device: b.deviceLabel ?? undefined,
        coverage: Object.keys(b.coverage).length ? b.coverage : undefined,
      }),
      signal: AbortSignal.timeout(8000),
    });
    result.ok = res.ok;
    result.httpStatus = res.status;
    result.responseBody = (await res.text().catch(() => '')).slice(0, 2000);
    if (!res.ok) console.error(`[expedify] lead hand-off HTTP ${res.status}:`, result.responseBody);
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error('[expedify] lead hand-off failed:', err);
  }

  // Record the outcome for the lead card (best-effort; skipped for test fires).
  if (lead.studentId) {
    try {
      const admin = createAdminClient();
      await admin.from('profiles')
        .update({ expedify_status: result.ok ? 'sent' : 'failed', expedify_synced_at: new Date().toISOString() })
        .eq('id', lead.studentId);
    } catch (err) {
      console.error('[expedify] status write failed:', err);
    }
  }

  return result;
}
