import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import { track } from '@/lib/journey';
import { getLogDateString } from '@/lib/streak-utils';
import type { StreakData } from '@/types';

interface LoggingPayload {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
  log_date?: string; // optional backdate — server validates must be today or yesterday
  day_outcome?: string; // how the day actually went — asked first in the sheet
}

interface LoggingResponse {
  success: boolean;
  streak: StreakData;
  crs?: number;
  bonus?: string;
  daily_nudge?: string | null;
  milestone?: string | null;
  report_date?: string; // the server's authoritative IST log-date for this submission
}

export interface InitialLogging {
  streak: StreakData | null;
  hasLoggedToday: boolean;
}

export function useLogging(studentId: string, initial?: InitialLogging | null) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<LoggingResponse | null>(null);

  const { data: streakData, isLoading: streakLoading } = useQuery({
    queryKey: ['streak', studentId],
    enabled: !!studentId,
    ...(initial ? { initialData: initial.streak } : {}),
    staleTime: 30_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('streak_data')
        .select('*')
        .eq('student_id', studentId)
        .maybeSingle();
      if (error) throw error;
      return data as StreakData | null;
    },
  });

  const { data: hasLoggedToday } = useQuery({
    queryKey: ['has-logged-today', studentId],
    enabled: !!studentId,
    ...(initial ? { initialData: initial.hasLoggedToday } : {}),
    staleTime: 30_000,
    queryFn: async () => {
      const dateStr = getLogDateString();
      const { data } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('student_id', studentId)
        .eq('report_date', dateStr)
        .maybeSingle();
      return !!data;
    },
  });

  const logMutation = useMutation({
    mutationFn: async (payload: LoggingPayload): Promise<LoggingResponse> => {
      const response = await fetch('/api/logging/log-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to log');
      }
      return (await response.json()) as LoggingResponse;
    },
    onSuccess: (data) => {
      track('daily_log', { report_date: data?.report_date, streak: data?.streak });
      setFeedbackData(data);
      setShowFeedback(true);
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['has-logged-today'] });
      queryClient.invalidateQueries({ queryKey: ['pending-debrief'] });
      queryClient.refetchQueries({ queryKey: ['progress-snapshot'] });
    },
  });

  const submitLog = useCallback(
    async (payload: LoggingPayload): Promise<LoggingResponse> => {
      return logMutation.mutateAsync(payload);
    },
    [logMutation]
  );

  return {
    currentStreak: streakData?.current_streak ?? 0,
    maxStreak: streakData?.longest_streak ?? 0,
    hasLoggedToday: hasLoggedToday ?? false,
    streakData,
    isLoading: streakLoading,
    isSubmitting: logMutation.isPending,
    error: logMutation.error?.message,
    showFeedback,
    feedbackData,
    setShowFeedback,
    submitLog,
  };
}
