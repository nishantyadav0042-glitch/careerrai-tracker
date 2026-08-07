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
  ok: boolean;              // handed off AND their workflow actually ran
  httpStatus: number | null;
  responseBody: string | null;
  error: string | null;
  /** Their workflow's own verdict: true ran, false failed, null unstated. */
  workflowOk: boolean | null;
  /** The failing node/message they named, e.g. "crmmanager_1: Operation failed". */
  workflowError: string | null;
}

/**
 * Expedify answers **200 OK even when the workflow behind the webhook failed**:
 *
 *   {"status":"failed","message":"0 of 1 workflows succeeded",
 *    "results":[{"workflow_name":"Contact Updates Webhook","success":false,
 *                "error":"crmmanager_1: Operation failed"}]}
 *
 * Observed live on 8 Aug: the lead was "accepted", no contact was created, the
 * Database Change Trigger never fired and no call was placed — while we wrote
 * `expedify_status: 'sent'`. Every "calls dispatched" figure since July counted
 * HTTP acceptances, not calls. The body is the truth; the status line is not.
 */
export function readWorkflowVerdict(body: string | null): { ok: boolean | null; error: string | null } {
  if (!body) return { ok: null, error: null };
  try {
    const p = JSON.parse(body) as {
      status?: unknown;
      results?: { success?: unknown; error?: unknown; workflow_name?: unknown }[];
    };
    const failing = Array.isArray(p.results)
      ? p.results.find((r) => r?.success === false)
      : undefined;
    const named = failing
      ? [failing.workflow_name, failing.error].filter((v) => typeof v === 'string').join(': ') || null
      : null;
    if (typeof p.status === 'string') {
      return { ok: p.status.toLowerCase() !== 'failed', error: named };
    }
    if (failing) return { ok: false, error: named };
  } catch {
    // Not JSON — fall through to the text shapes they also emit.
  }
  if (/no workflows? connected/i.test(body)) return { ok: false, error: 'no workflow connected to this webhook' };
  const counted = body.match(/(\d+)\s+of\s+(\d+)\s+workflows?\s+succeeded/i);
  if (counted) return { ok: Number(counted[1]) > 0, error: counted[0] };
  return { ok: null, error: null };
}

export async function sendExpedifyLead(lead: ExpedifyLead): Promise<ExpedifyResult> {
  const url = process.env.EXPEDIFY_WEBHOOK_URL;
  if (!url) return { configured: false, ok: false, httpStatus: null, responseBody: null, error: 'EXPEDIFY_WEBHOOK_URL not set', workflowOk: null, workflowError: null };

  const key = process.env.EXPEDIFY_API_KEY;
  const b = lead.brief;
  const result: ExpedifyResult = { configured: true, ok: false, httpStatus: null, responseBody: null, error: null, workflowOk: null, workflowError: null };
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
    result.httpStatus = res.status;
    result.responseBody = (await res.text().catch(() => '')).slice(0, 2000);
    // Their 200 is only an acceptance receipt. The workflow's own verdict is
    // in the body, and a failed workflow means no contact, no trigger, no call.
    const verdict = readWorkflowVerdict(result.responseBody);
    result.workflowOk = verdict.ok;
    result.workflowError = verdict.error;
    result.ok = res.ok && verdict.ok !== false;
    if (!res.ok) console.error(`[expedify] lead hand-off HTTP ${res.status}:`, result.responseBody);
    else if (verdict.ok === false) {
      console.error('[expedify] accepted but workflow FAILED — no call placed:', verdict.error, result.responseBody);
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : String(err);
    console.error('[expedify] lead hand-off failed:', err);
  }

  // Record the outcome for the lead card (best-effort; skipped for test fires).
  if (lead.studentId) {
    try {
      const admin = createAdminClient();
      await admin.from('profiles')
        .update({
          // 'workflow_failed' is deliberately its own state: the hand-off was
          // fine, THEIR automation broke. Lumping it into 'failed' would send
          // us re-checking our own API key for a problem on their canvas.
          expedify_status: result.ok ? 'sent' : result.workflowOk === false ? 'workflow_failed' : 'failed',
          expedify_synced_at: new Date().toISOString(),
        })
        .eq('id', lead.studentId);
    } catch (err) {
      console.error('[expedify] status write failed:', err);
    }
  }

  return result;
}
