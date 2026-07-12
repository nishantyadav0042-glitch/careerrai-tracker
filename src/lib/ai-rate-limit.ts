// Per-user hourly cap for routes that hit the shared free-tier Gemini key, so
// one user can't exhaust the quota for the whole tenant. Mirrors the existing
// throttle in parse-scorecard/route.ts (analytics_events counter). Fail-OPEN on
// a counter error — an AI feature degrading to "unthrottled" is preferable to it
// hard-failing for everyone, and the global Gemini quota is still a backstop.
//
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any;

// Returns true if the user is already at/over `limit` calls of `eventType` in
// the last hour. Check this AFTER auth and before the model call.
export async function overAiHourlyLimit(
  admin: Admin,
  userId: string,
  eventType: string,
  limit: number
): Promise<boolean> {
  const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
  const { count } = await admin
    .from('analytics_events')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', userId)
    .eq('event_type', eventType)
    .gte('created_at', hourAgo);
  return (count ?? 0) >= limit;
}

// Record one call. Best-effort; a failed insert only means this call isn't
// counted toward the cap.
export async function recordAiCall(admin: Admin, userId: string, eventType: string): Promise<void> {
  await admin.from('analytics_events').insert({ student_id: userId, event_type: eventType, metadata: {} });
}
