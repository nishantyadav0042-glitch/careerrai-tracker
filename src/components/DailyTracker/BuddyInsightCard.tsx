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

  const { data } = useQuery({
    queryKey: ['buddy-insight', studentId],
    queryFn: async () => {
      const [{ data: feedback }, { data: me }] = await Promise.all([
        supabase
          .from('buddy_feedback')
          .select('feedback_text, feedback_date, feedback_type')
          .eq('student_id', studentId)
          .eq('feedback_type', 'buddy_feedback')
          .order('feedback_date', { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase.from('profiles').select('buddy_id').eq('id', studentId).maybeSingle(),
      ]);
      let buddy: { full_name: string; cat_percentile: number | null } | null = null;
      if (me?.buddy_id) {
        const { data: b } = await supabase
          .from('profiles')
          .select('full_name, cat_percentile')
          .eq('id', me.buddy_id)
          .maybeSingle();
        buddy = b;
      }
      return { feedback, buddy };
    },
    staleTime: 10 * 60 * 1000,
  });

  const latestFeedback = data?.feedback;
  const buddy = data?.buddy;
  const nudgeText = dailyNudge ?? latestFeedback?.feedback_text ?? null;

  if (!nudgeText) return null;

  const isSystemNudge = !!dailyNudge && !latestFeedback;
  const label = isSystemNudge ? '⚠️ Pattern detected' : '💬 Buddy';
  // Journey, not brand — the buddy's own CAT outcome under their words
  const journeyLine =
    !isSystemNudge && buddy
      ? `${buddy.full_name.split(' ')[0]}${buddy.cat_percentile != null ? ` · hit ${Math.round(Number(buddy.cat_percentile))} %ile in CAT` : ''}`
      : null;

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
