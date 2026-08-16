// ── The consent/subscription audit trail ──────────────────────────────────
//
// Notification Reliability V2, Installment 4, Batch C. Every write so far —
// notif_prefs.push, push_subscription, push_died_at — has been a
// point-in-time overwrite: current state was always knowable, the sequence
// of events that produced it never was. This is append-only by convention
// (no caller ever updates or deletes a row); it never gates or blocks a
// write to profiles — logging failure must never break a subscribe/decline/
// recovery attempt, so this is always fire-and-forget from the caller's
// perspective, but never silent: it logs its own failure.

export type ConsentEventType =
  | 'permission_granted' | 'permission_denied'
  | 'subscription_created' | 'subscription_refreshed' | 'subscription_died'
  | 'recovery_required' | 'recovery_attempted' | 'recovery_succeeded' | 'recovery_failed'
  | 'user_disabled_notifications';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function logConsentEvent(admin: any, studentId: string, eventType: ConsentEventType, detail?: string | null): Promise<void> {
  try {
    const { error } = await admin.from('notification_consent_events').insert({
      student_id: studentId, event_type: eventType, detail: detail ?? null,
    });
    if (error) console.error('[consent-history] insert failed:', eventType, error.message);
  } catch (err) {
    console.error('[consent-history] insert threw:', eventType, err instanceof Error ? err.message : err);
  }
}
