'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface FeedbackRow {
  feedback_text: string;
  feedback_date: string;
  feedback_type: string;
}

interface BuddyInsightCardProps {
  studentId: string;
  dailyNudge?: string | null;
  /** Passed from server component — eliminates 2 of 3 client Supabase waterfalls */
  buddyId?: string | null;
  /** Pre-formatted: "Rajan · 99%ile" or just "Rajan" */
  buddyName?: string | null;
  /** Latest buddy feedback seeded from server — skips client DB query on mount */
  initialFeedback?: FeedbackRow | null;
}

export function BuddyInsightCard({ studentId, dailyNudge, buddyId: buddyIdProp, buddyName: buddyNameProp, initialFeedback }: BuddyInsightCardProps) {
  const supabase = createClient();

  const { data } = useQuery({
    queryKey: ['buddy-insight', studentId],
    ...(initialFeedback != null ? { initialData: { feedback: initialFeedback } } : {}),
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      // Only 1 query — buddy identity already comes from server props
      const { data: feedback } = await supabase
        .from('buddy_feedback')
        .select('feedback_text, feedback_date, feedback_type')
        .eq('student_id', studentId)
        .eq('feedback_type', 'buddy_feedback')
        .order('feedback_date', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { feedback };
    },
  });

  const latestFeedback = data?.feedback;
  const nudgeText = dailyNudge ?? latestFeedback?.feedback_text ?? null;

  // Always render a placeholder when buddy is matched but no feedback yet —
  // prevents layout jump when card disappears
  if (!nudgeText && !buddyIdProp) return null;

  if (!nudgeText && buddyIdProp) {
    return (
      <div className="flex items-start gap-2 bg-teal-50 border border-teal-100 rounded-2xl px-4 py-3">
        <span className="text-xs font-bold text-teal-600 shrink-0 mt-0.5">💬 Buddy</span>
        <p className="text-xs text-teal-700 leading-snug">
          Your buddy will respond after today&apos;s debrief.
        </p>
      </div>
    );
  }

  const isSystemNudge = !!dailyNudge && !latestFeedback;
  const label = isSystemNudge ? '⚠️ Pattern detected' : '💬 Buddy';
  const journeyLine = !isSystemNudge && buddyNameProp ? buddyNameProp : null;

  return (
    <Link href="/student/buddy" className="block">
      <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
        <span className="text-xs font-bold text-teal-700 shrink-0 mt-0.5">{label}</span>
        <div className="min-w-0">
          <p className="text-xs text-teal-900 leading-snug line-clamp-2">{nudgeText}</p>
          {journeyLine && <p className="text-[10px] text-teal-600 mt-1">{journeyLine}</p>}
        </div>
      </div>
    </Link>
  );
}
