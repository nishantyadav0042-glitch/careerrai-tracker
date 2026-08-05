import { createAdminClient } from '@/lib/supabase/admin';

// The integration audit trail.
//
// Founder ask, 5 Aug: "log every important action — this will save hours when
// debugging." Incident #21 is the argument. That evening we could see the
// symptom (two people in two rooms) and the end state (four live sessions),
// but not the ORDER things happened in, so the first hour went to
// reconstructing a timeline from `created_at` columns that were never meant to
// be one.
//
// Two rules make this trustworthy rather than decorative:
//
//  1. It is AWAITED. A fire-and-forget log is the log that isn't there on the
//     night you need it — we already shipped one fire-and-forget write this
//     month that silently never landed.
//  2. It never carries a secret. The table has a CHECK constraint that rejects
//     any row whose detail mentions a token, and `safeDetail` strips them
//     before we get there — so a careless caller fails loudly in dev instead
//     of quietly leaking in production.

export type AuditAction =
  | 'google.connected'
  | 'google.disconnected'
  | 'google.connect_failed'   // consent refused, or the token exchange failed
  | 'google.revoked'          // Google rejected our refresh token — not a user action
  | 'google.account_changed'
  | 'google.api_error'
  | 'room.created'
  | 'room.regenerated'
  | 'booking.created'
  | 'booking.rejected'
  | 'booking.cancelled'
  | 'booking.expired'      // released by the stale-session cron, outcome unknown
  | 'booking.rescheduled'
  | 'chat.attachment_uploaded'
  | 'chat.attachment_rejected'  // failed validation, at either stage
  | 'chat.attachment_denied'    // someone asked for a conversation they are not in
  | 'admin.session_cancelled'
  | 'admin.room_regenerated';

const FORBIDDEN = ['refresh_token', 'access_token', 'client_secret', 'id_token', 'code', 'authorization'];

/** Drops anything that looks like a credential, at any depth. */
function safeDetail(detail: Record<string, unknown>): Record<string, unknown> {
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    if (FORBIDDEN.includes(k.toLowerCase())) continue;
    clean[k] = v && typeof v === 'object' && !Array.isArray(v)
      ? safeDetail(v as Record<string, unknown>)
      : v;
  }
  return clean;
}

export interface AuditEntry {
  /** Whose integration this concerns. */
  subjectId: string | null;
  /** Who caused it — the subject, an admin, or null for system/cron. */
  actorId?: string | null;
  action: AuditAction;
  detail?: Record<string, unknown>;
  ok?: boolean;
}

/**
 * Write one audit row. Never throws: a failure to log must not fail the
 * action being logged — but it IS awaited, and it IS reported to the server
 * console, so a broken audit trail cannot go unnoticed.
 */
export async function audit(entry: AuditEntry): Promise<void> {
  try {
    const admin = createAdminClient();
    const { error } = await admin.from('integration_audit_log').insert({
      subject_id: entry.subjectId,
      // `'actorId' in entry`, not `??`: an EXPLICIT null means "the system did
      // this" and must survive. Coalescing it to the subject would record
      // `google.revoked` as though the mentor disconnected themselves — the
      // exact opposite of what happened, in the log you read to find out what
      // happened.
      actor_id: 'actorId' in entry ? entry.actorId ?? null : entry.subjectId,
      action: entry.action,
      detail: safeDetail(entry.detail ?? {}),
      ok: entry.ok ?? true,
    });
    if (error) console.error('[audit] write failed:', entry.action, error.message);
  } catch (e) {
    console.error('[audit] write threw:', entry.action, String(e));
  }
}
