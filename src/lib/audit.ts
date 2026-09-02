import { createAdminClient } from '@/lib/supabase/admin';

/**
 * `adminId` null = the platform itself acted (a scheduled engine with no human
 * behind it). Added 2 Sep 2026 for the daily lead intake; the metadata names
 * the engine so the row still says who did it.
 */
export async function logAdminAction(
  adminId: string | null,
  action: string,
  targetType: string,
  targetId: string | null,
  metadata?: Record<string, unknown>,
) {
  try {
    const admin = createAdminClient();
    await admin.from('admin_audit_log').insert({
      admin_id: adminId,
      action,
      target_type: targetType,
      target_id: targetId,
      metadata,
    });
  } catch (e) {
    // Audit log failure must never break the primary action
    console.error('[audit] failed to write audit log:', e);
  }
}
