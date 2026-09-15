import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchAll } from './supabase/fetch-all';
import { chunked } from './cron-sweep';

// ── Who is already INSIDE the app today ────────────────────────────────────
//
// NOTIFICATION-OS §1, restated as working rule §10b.1: "A notification exists
// to bring a student back when they're not in the app. If the student is
// already inside CareerRai, the notification has already done its job or
// already failed — it is not the mechanism." §2c adds the price: every push
// spends a finite attention budget, and one spent on a student who already
// came back is budget the next real reach needed.
//
// This answers that question for a *set* of students in one paged read, so a
// cron can ask it once for its whole roster instead of per student.
//
// `app_open` is the signal, not "any event": metric-registry has said so since
// the two dashboards disagreed on 2 of 8 days, and a student whose only row is
// a background beacon did not come back.
//
// Paged and chunked, both deliberately (Incident #65): student_events is a
// 237k-row table, and an unbounded read of it returns the first thousand rows
// with no error — which here would read as "almost nobody opened the app",
// the exact wrong answer in the exact wrong direction.
//
// THROWS on a read error rather than returning an empty set. An empty set
// means "nobody is inside the app", and a caller that cannot tell that from
// "we could not look" would quietly act on the failure as if it were a fact.
export async function studentsInsideAppSince(
  admin: SupabaseClient,
  studentIds: readonly string[],
  sinceIso: string,
): Promise<Set<string>> {
  const inside = new Set<string>();
  if (studentIds.length === 0) return inside;

  for (const chunk of chunked([...studentIds])) {
    const { data, error } = await fetchAll<{ user_id: string }>(() => admin
      .from('student_events')
      .select('user_id')
      .eq('event', 'app_open')
      .gte('created_at', sinceIso)
      .in('user_id', chunk));
    if (error) throw new Error(`[in-app-today] app_open read failed: ${error.message}`);
    for (const row of data ?? []) if (row.user_id) inside.add(row.user_id);
  }
  return inside;
}
