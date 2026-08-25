import { logAdminAction } from '@/lib/audit';

/* eslint-disable @typescript-eslint/no-explicit-any */

// ── Privileged sales actions leave a trace ──────────────────────────────────
//
// `admin_audit_log` already existed, already keys its actor by uuid
// (`admin_id`), and already has exactly one writer. Its problem was never
// design — it was COVERAGE: 9 rows across ten weeks, three action types, while
// premium grants, payment-state changes, lead assignment and account deletion
// wrote nothing at all.
//
// So this module adds call sites, not a second audit system. Every function
// here is a thin, named wrapper so that "what privileged sales actions exist"
// is answerable by reading one file instead of grepping for insert statements.
//
// Rule: an audit write must never break the action it records. logAdminAction
// already swallows and logs its own failures; nothing here re-throws.

export const SALES_AUDIT_ACTIONS = [
  'lead_assigned',
  'lead_reassigned',
  'lead_unassigned',
  'lead_bulk_assigned',
  'vendor_event_repaired',
  'vendor_event_discarded',
  'followup_cancelled',
  'handoff_purged',
  // Phase 2B-1: capacity configuration. A ceiling that can be changed
  // invisibly is not a control, it is a rumour — so every change records
  // before/after like every other privileged sales mutation.
  'rep_config_updated',
] as const;
export type SalesAuditAction = (typeof SALES_AUDIT_ACTIONS)[number];

/**
 * Record one privileged sales mutation.
 *
 * `before`/`after` are deliberately separate fields rather than a free-text
 * note: "who changed what, from what, to what" is the question an audit log
 * exists to answer, and a sentence cannot be queried.
 */
export async function auditSales(
  actorId: string,
  action: SalesAuditAction,
  target: { type: 'lead' | 'vendor_event' | 'followup' | 'system' | 'rep'; id: string | null },
  detail: { before?: unknown; after?: unknown; reason?: string; count?: number } = {},
): Promise<void> {
  await logAdminAction(actorId, action, target.type, target.id, {
    ...(detail.before !== undefined ? { before: detail.before } : {}),
    ...(detail.after !== undefined ? { after: detail.after } : {}),
    ...(detail.reason ? { reason: detail.reason } : {}),
    ...(detail.count !== undefined ? { count: detail.count } : {}),
  });
}

export interface AuditRow {
  id: string | number;
  actorId: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  at: string;
  metadata: Record<string, unknown> | null;
}

/** Recent privileged actions, newest first. Bounded. */
export async function recentAudit(admin: any, limit = 100): Promise<AuditRow[] | null> {
  const { data, error } = await admin
    .from('admin_audit_log')
    .select('id, admin_id, action, target_type, target_id, metadata, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  // null means "we could not read the audit trail" — which a surface must
  // render as a failure, never as "no privileged actions have occurred".
  if (error) {
    console.error('[sales-audit] read failed:', error.message);
    return null;
  }
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    actorId: r.admin_id ?? null,
    action: r.action,
    targetType: r.target_type ?? null,
    targetId: r.target_id ?? null,
    at: r.created_at,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
  }));
}
