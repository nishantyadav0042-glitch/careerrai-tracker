import { createAdminClient } from '@/lib/supabase/admin';

export async function logAdminAction(
  adminId: string,
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
