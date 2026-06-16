/**
 * Buddy SLA computation — pure functions over already-fetched data.
 * All DB queries live in the caller (admin page server component).
 */

export interface BuddySLARecord {
  buddy_id: string;
  buddy_name: string;
  student_count: number;
  /** Average percentile delta (cat_percentile − starting_percentile) across students with both values */
  avg_percentile_delta: number | null;
  /** Average hours from student log date to buddy feedback (last 14 days) */
  avg_response_hrs: number | null;
  /** % of scheduled video sessions that were completed (0–100), null if no sessions */
  session_show_up_rate: number | null;
  /** Buddy_feedback items in last 14 days */
  feedback_count_14d: number;
}

interface BuddyRow {
  id: string;
  full_name: string;
}

interface StudentRow {
  id: string;
  buddy_id: string | null;
  cat_percentile: number | null;
  starting_percentile: number | null;
}

interface FeedbackRow {
  buddy_id: string;
  created_at: string;
  feedback_date: string;
}

interface SessionRow {
  buddy_id: string | null;
  session_status: string;
}

export function computeBuddySLA(
  buddies: BuddyRow[],
  students: StudentRow[],
  recentFeedback: FeedbackRow[],
  videoSessions: SessionRow[]
): BuddySLARecord[] {
  return buddies.map((b) => {
    const myStudents = students.filter((s) => s.buddy_id === b.id);

    // Avg percentile delta
    const deltas = myStudents
      .filter((s) => s.cat_percentile !== null && s.starting_percentile !== null)
      .map((s) => s.cat_percentile! - s.starting_percentile!);
    const avg_percentile_delta =
      deltas.length > 0
        ? Math.round((deltas.reduce((sum, d) => sum + d, 0) / deltas.length) * 10) / 10
        : null;

    // Avg response hours (feedback_date → created_at gap)
    const myFeedback = recentFeedback.filter((f) => f.buddy_id === b.id);
    const gaps = myFeedback
      .map((f) => (new Date(f.created_at).getTime() - new Date(f.feedback_date + 'T00:00:00').getTime()) / 3_600_000)
      .filter((h) => h >= 0 && h < 168); // cap at 1 week to exclude stale outliers
    const avg_response_hrs =
      gaps.length > 0 ? Math.max(1, Math.round(gaps.reduce((s, h) => s + h, 0) / gaps.length)) : null;

    // Session show-up rate
    const mySessions = videoSessions.filter((v) => v.buddy_id === b.id);
    const scheduled = mySessions.filter(
      (v) => v.session_status === 'scheduled' || v.session_status === 'completed'
    ).length;
    const completed = mySessions.filter((v) => v.session_status === 'completed').length;
    const session_show_up_rate =
      scheduled > 0 ? Math.round((completed / scheduled) * 100) : null;

    return {
      buddy_id: b.id,
      buddy_name: b.full_name,
      student_count: myStudents.length,
      avg_percentile_delta,
      avg_response_hrs,
      session_show_up_rate,
      feedback_count_14d: myFeedback.length,
    };
  }).sort((a, b) => {
    // Primary sort: avg_percentile_delta desc (null last)
    if (a.avg_percentile_delta !== null && b.avg_percentile_delta !== null) {
      return b.avg_percentile_delta - a.avg_percentile_delta;
    }
    if (a.avg_percentile_delta !== null) return -1;
    if (b.avg_percentile_delta !== null) return 1;
    return 0;
  });
}
