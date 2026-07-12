// Best-effort security audit trail (public.security_events, service-role only).
// NEVER throws and never rejects — a logging failure must not break the request
// it is observing. In serverless we MUST await the insert (an un-awaited promise
// can be dropped when the function freezes), so callers should `await` this.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

export type SecuritySeverity = 'info' | 'warning' | 'critical';

export interface SecurityEvent {
  type: string;
  severity?: SecuritySeverity;
  userId?: string | null;
  ip?: string | null;
  metadata?: Record<string, unknown>;
}

export async function logSecurityEvent(admin: Admin, e: SecurityEvent): Promise<void> {
  try {
    const { error } = await admin.from('security_events').insert({
      event_type: e.type,
      severity: e.severity ?? 'info',
      user_id: e.userId ?? null,
      ip: e.ip ?? null,
      metadata: e.metadata ?? {},
    });
    if (error) console.error('[security-log]', e.type, error.message);
  } catch (err) {
    console.error('[security-log] threw:', (err as Error)?.message);
  }
}
