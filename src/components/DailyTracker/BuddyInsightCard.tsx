'use client';

import { useQuery } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';

interface BuddyInsightCardProps {
  studentId: string;
  dailyNudge?: string | null;
}

export function BuddyInsightCard({ studentId, dailyNudge }: BuddyInsightCardProps) {
  const supabase = createClient();

  const { data: latestFeedback } = useQuery({
    queryKey: ['buddy-insight', studentId],
    queryFn: async () => {
      const { data } = await supabase
        .from('buddy_feedback')
        .select('feedback_text, feedback_date, feedback_type')
        .eq('student_id', studentId)
        .eq('feedback_type', 'buddy_feedback')
        .order('feedback_date', { ascending: false })
        .limit(1)
        .single();
      return data;
    },
    staleTime: 10 * 60 * 1000,
  });

  const nudgeText = dailyNudge ?? latestFeedback?.feedback_text ?? null;

  if (!nudgeText) return null;

  const isSystemNudge = !!dailyNudge && !latestFeedback;
  const label = isSystemNudge ? '⚠️ Pattern detected' : '💬 Buddy';

  return (
    <Link href="/student/buddy" className="block">
      <div className="flex items-start gap-2 bg-teal-50 border border-teal-200 rounded-2xl px-4 py-3">
        <span className="text-xs font-bold text-teal-700 shrink-0 mt-0.5">{label}</span>
        <p className="text-xs text-teal-900 leading-snug line-clamp-2">{nudgeText}</p>
      </div>
    </Link>
  );
}
