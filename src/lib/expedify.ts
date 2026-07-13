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
// Field names below are our best-guess defaults — tell me Expedify's exact
// expected payload (field names + phone format + auth header) and I'll match it.
export interface ExpedifyLead {
  studentId: string;
  name: string;
  phone: string;            // E.164, e.g. +919876543210
  email?: string | null;
  source?: string | null;   // 'self_serve' | 'allowlist'
  brief: StudentBrief;
}

export async function sendExpedifyLead(lead: ExpedifyLead): Promise<void> {
  const url = process.env.EXPEDIFY_WEBHOOK_URL;
  if (!url) return; // not configured — no-op (status stays null on the card)

  const admin = createAdminClient();
  const key = process.env.EXPEDIFY_API_KEY;
  const b = lead.brief;
  let status: 'sent' | 'failed' = 'failed';
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
        email: lead.email ?? undefined,
        source: lead.source ?? 'careerrai',
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
        coverage: Object.keys(b.coverage).length ? b.coverage : undefined,
      }),
      signal: AbortSignal.timeout(6000),
    });
    status = res.ok ? 'sent' : 'failed';
    if (!res.ok) {
      console.error(`[expedify] lead hand-off HTTP ${res.status}:`, await res.text().catch(() => ''));
    }
  } catch (err) {
    console.error('[expedify] lead hand-off failed:', err);
    status = 'failed';
  }

  // Record the outcome for the lead card (best-effort).
  try {
    await admin.from('profiles')
      .update({ expedify_status: status, expedify_synced_at: new Date().toISOString() })
      .eq('id', lead.studentId);
  } catch (err) {
    console.error('[expedify] status write failed:', err);
  }
}
