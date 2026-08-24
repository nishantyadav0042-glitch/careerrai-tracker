/* eslint-disable @typescript-eslint/no-explicit-any */

// ── The Data Quality layer ──────────────────────────────────────────────────
//
// This is the one sales surface that was buildable on day one, because its
// subject matter IS the missing data. Every other level of the Control Tower
// renders numbers derived from the CRM; this one renders whether those numbers
// can be trusted at all.
//
// The check that justifies the whole panel: "vendor call event attached to a
// non-student". It returns 236 against production history, and it would have
// caught the entire Expedify defect on day one, in one line of SQL, without
// anyone reading a payload.
//
// FAILURE SEMANTICS. A check that cannot run returns `value: null`, never 0.
// The distinction the founder insisted on lives here:
//
//   0                                   → observed zero
//   NOT AVAILABLE — DATA NOT INSTRUMENTED
//   NOT AVAILABLE — DATA QUALITY FAILURE
//   UNKNOWN — SOURCE UNAVAILABLE
//
// A naked zero that actually means "we could not look" is the failure mode this
// codebase has paid for more than any other.

export type CheckSeverity = 'critical' | 'warning' | 'info';
export type CheckStatus = 'ok' | 'attention' | 'unavailable' | 'not_instrumented';

export interface QualityCheck {
  key: string;
  label: string;
  /** Why a founder should care — one sentence, no jargon. */
  why: string;
  /** null = the check could not run. NEVER coerce to 0. */
  value: number | null;
  /** At or above this, the check needs attention. */
  threshold: number;
  severity: CheckSeverity;
  status: CheckStatus;
  /** What to do about it. */
  action: string;
  /** Where the number comes from, so it can be re-derived by hand. */
  evidence: string;
}

function statusFor(value: number | null, threshold: number): CheckStatus {
  if (value === null) return 'unavailable';
  return value > threshold ? 'attention' : 'ok';
}

/** One bounded count. Returns null on any read failure — never 0. */
async function count(admin: any, build: (q: any) => any, table: string): Promise<number | null> {
  try {
    const { count: n, error } = await build(admin.from(table).select('*', { count: 'exact', head: true }));
    if (error) {
      console.error(`[data-quality] ${table} count failed:`, error.message);
      return null;
    }
    return n ?? 0;
  } catch (e) {
    console.error(`[data-quality] ${table} count threw:`, e);
    return null;
  }
}

export async function runQualityChecks(admin: any): Promise<QualityCheck[]> {
  const nowIso = new Date().toISOString();
  const staleCutoff = new Date(Date.now() - 14 * 86_400_000).toISOString();

  const [
    vendorNonStudent, vendorUnmatched, vendorUnresolved, vendorNullKey,
    leadsNoOwner, activityNoActor, followupOverdue, followupOrphanOwner,
    handoffStale, studentsNoPhone, paymentsNoLead, staleLeads,
  ] = await Promise.all([
    // THE check. A vendor call event whose student is not a student at all.
    count(admin, (q: any) => q.not('student_id', 'is', null), 'expedify_events')
      .then(async (total) => {
        if (total === null) return null;
        try {
          const { data, error } = await admin
            .from('expedify_events')
            .select('student_id, profiles!inner(role)')
            .not('student_id', 'is', null)
            .neq('profiles.role', 'student');
          if (error) return null;
          return (data ?? []).length;
        } catch { return null; }
      }),
    count(admin, (q: any) => q.eq('resolution', 'unmatched'), 'expedify_events'),
    count(admin, (q: any) => q.eq('resolution', 'unresolved'), 'expedify_events'),
    count(admin, (q: any) => q.is('dedupe_key', null), 'expedify_events'),
    count(admin, (q: any) => q.is('owner_id', null), 'lead_outreach'),
    count(admin, (q: any) => q.is('actor_id', null).not('provenance', 'in', '("vendor_reported","observed","unknown")'), 'sales_activity'),
    count(admin, (q: any) => q.eq('status', 'open').lt('due_at', nowIso), 'sales_followup'),
    count(admin, (q: any) => q.eq('status', 'open').is('owner_id', null), 'sales_followup'),
    count(admin, (q: any) => q.lt('expires_at', nowIso), 'pwa_session_handoff'),
    count(admin, (q: any) => q.eq('role', 'student').is('phone', null).not('is_test_account', 'is', true), 'profiles'),
    // A paid customer with no lead record — "which sales activity produced this
    // revenue" is unanswerable for every one of these.
    (async () => {
      try {
        const { data: paid, error } = await admin.from('student_payments').select('student_id').eq('status', 'paid');
        if (error) return null;
        const ids = [...new Set(((paid ?? []) as any[]).map((r) => r.student_id))];
        if (ids.length === 0) return 0;
        const { data: leads, error: le } = await admin.from('lead_outreach').select('student_id').in('student_id', ids);
        if (le) return null;
        const withLead = new Set(((leads ?? []) as any[]).map((r) => r.student_id));
        return ids.filter((id) => !withLead.has(id)).length;
      } catch { return null; }
    })(),
    count(admin, (q: any) => q.not('owner_id', 'is', null).lt('updated_at', staleCutoff)
      .not('status', 'in', '("converted","not_interested")'), 'lead_outreach'),
  ]);

  return [
    {
      key: 'vendor_event_non_student',
      label: 'Vendor call events attached to a non-student',
      why: 'A call report filed against a staff or mentor profile is prima facie wrong. This single check would have caught the entire Expedify phone-matching defect on day one.',
      value: vendorNonStudent, threshold: 0, severity: 'critical',
      status: statusFor(vendorNonStudent, 0),
      action: 'Quarantine as non-evidence. Do not normalise into sales activity.',
      evidence: 'expedify_events JOIN profiles WHERE profiles.role <> student',
    },
    {
      key: 'vendor_unmatched',
      label: 'Vendor events awaiting repair',
      why: 'The vendor did not return our correlation reference, so we cannot say which student was called. Guessing by phone is exactly what we stopped doing.',
      value: vendorUnmatched, threshold: 0, severity: 'warning',
      status: statusFor(vendorUnmatched, 0),
      action: 'Repair by hand from the Unmatched queue, or ask the vendor to echo external_ref.',
      evidence: "expedify_events WHERE resolution = 'unmatched'",
    },
    {
      key: 'vendor_unresolved_legacy',
      label: 'Historical vendor events (pre-correlation)',
      why: 'Events received before the correlation key existed. They are evidence of the old defect, deliberately preserved and deliberately not repaired.',
      value: vendorUnresolved, threshold: Number.MAX_SAFE_INTEGER, severity: 'info',
      status: statusFor(vendorUnresolved, Number.MAX_SAFE_INTEGER),
      action: 'Leave alone. Deleting them would destroy the proof of what happened.',
      evidence: "expedify_events WHERE resolution = 'unresolved'",
    },
    {
      key: 'vendor_null_dedupe',
      label: 'Vendor events with no idempotency key',
      why: 'PostgreSQL permits unlimited NULLs in a unique index, so a NULL key silently bypasses replay protection. 220 duplicate deliveries arrived in one day because of this.',
      value: vendorNullKey, threshold: Number.MAX_SAFE_INTEGER, severity: 'info',
      status: statusFor(vendorNullKey, Number.MAX_SAFE_INTEGER),
      action: 'Historical only — new events are rejected without a key.',
      evidence: 'expedify_events WHERE dedupe_key IS NULL',
    },
    {
      key: 'leads_without_owner',
      label: 'Leads with no owner',
      why: 'An unowned lead is legal (shared book) but nobody is accountable for it. At scale this is where leads go to die.',
      value: leadsNoOwner, threshold: 0, severity: 'warning',
      status: statusFor(leadsNoOwner, 0),
      action: 'Assign from the Unassigned queue.',
      evidence: 'lead_outreach WHERE owner_id IS NULL',
    },
    {
      key: 'activity_without_actor',
      label: 'Human activity with no actor',
      why: 'A logged call that cannot name who made it is not history, it is a rumour.',
      value: activityNoActor, threshold: 0, severity: 'critical',
      status: statusFor(activityNoActor, 0),
      action: 'Investigate the writer. Only vendor/observed rows may have a null actor.',
      evidence: 'sales_activity WHERE actor_id IS NULL AND provenance is human',
    },
    {
      key: 'followups_overdue',
      label: 'Follow-ups past due',
      why: 'A promise was made to a student and the date has passed.',
      value: followupOverdue, threshold: 0, severity: 'warning',
      status: statusFor(followupOverdue, 0),
      action: 'Work the Overdue queue, or reassign.',
      evidence: "sales_followup WHERE status='open' AND due_at < now()",
    },
    {
      key: 'followups_orphan_owner',
      label: 'Open follow-ups with no owner',
      why: 'An obligation nobody holds.',
      value: followupOrphanOwner, threshold: 0, severity: 'critical',
      status: statusFor(followupOrphanOwner, 0),
      action: 'Reassign immediately.',
      evidence: "sales_followup WHERE status='open' AND owner_id IS NULL",
    },
    {
      key: 'handoff_expired_retained',
      label: 'Expired session hand-off tokens still stored',
      why: 'Each row holds an encrypted Supabase access + refresh token pair. They are needed for 15 minutes and were being kept for weeks.',
      value: handoffStale, threshold: 0, severity: 'critical',
      status: statusFor(handoffStale, 0),
      action: 'The purge cron clears these hourly. A rising number means the cron is not running.',
      evidence: 'pwa_session_handoff WHERE expires_at < now()',
    },
    {
      key: 'students_without_phone',
      label: 'Students with no phone number',
      why: 'Structurally uncallable — they cannot appear in any phone-based sales surface, and their absence is otherwise invisible.',
      value: studentsNoPhone, threshold: 0, severity: 'info',
      status: statusFor(studentsNoPhone, 0),
      action: 'Collect at the next product touchpoint. Not a defect, but it must be visible.',
      evidence: 'profiles WHERE role=student AND phone IS NULL AND NOT is_test_account',
    },
    {
      key: 'payments_without_lead',
      label: 'Paid customers with no lead record',
      why: 'Revenue that cannot be attributed to any sales activity. Attribution for these is UNKNOWN, and must never be assigned to whoever happens to own the student later.',
      value: paymentsNoLead, threshold: 0, severity: 'warning',
      status: statusFor(paymentsNoLead, 0),
      action: 'Leave unattributed. Do not backfill a sales chain that did not exist.',
      evidence: "student_payments status='paid' with no lead_outreach row",
    },
    {
      key: 'stale_leads',
      label: 'Owned leads untouched for 14+ days',
      why: 'Someone owns them and nothing has happened. This is the number that says a rep is sitting on a book.',
      value: staleLeads, threshold: 0, severity: 'warning',
      status: statusFor(staleLeads, 0),
      action: 'Redistribute from the Stale queue.',
      evidence: 'lead_outreach owned, updated_at older than 14 days, still open',
    },
  ];
}

/** How a surface must render a metric it could not compute. */
export function renderValue(value: number | null, opts: { instrumented?: boolean } = {}): string {
  if (opts.instrumented === false) return 'NOT AVAILABLE — DATA NOT INSTRUMENTED';
  if (value === null) return 'NOT AVAILABLE — DATA QUALITY FAILURE';
  return String(value);
}
