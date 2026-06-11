import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { StreakData } from '@/types';

interface LoggingPayload {
  hours: number;
  topics: string[];
  mood: string;
  mockScore?: { percentile: number; time: number };
  notes?: string;
}

interface LoggingResponse {
  success: boolean;
  streak: StreakData;
  crs?: number;
  bonus?: string;
}

export function useLogging() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackData, setFeedbackData] = useState<LoggingResponse | null>(null);

  // Fetch current streak
  const { data: streakData, isLoading: streakLoading } = useQuery({
    queryKey: ['streak'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('streak_data')
        .select('*')
        .eq('student_id', user.id)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as StreakData | null;
    },
  });

  // Check if already logged today
  const { data: hasLoggedToday } = useQuery({
    queryKey: ['has-logged-today'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return false;

      const today = new Date().toISOString().split('T')[0];
      const { data } = await supabase
        .from('daily_reports')
        .select('id')
        .eq('student_id', user.id)
        .eq('report_date', today)
        .single();

      return !!data;
    },
  });

  // Get shields remaining
  const { data: shieldsData } = useQuery({
    queryKey: ['shields-remaining'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return 0;

      const today = new Date();
      const resetDate = new Date(today.getFullYear(), today.getMonth() + 1, 1);

      const { data } = await supabase
        .from('streak_shields')
        .select('id')
        .eq('student_id', user.id)
        .gte('created_at', new Date(today.getFullYear(), today.getMonth(), 1).toISOString())
        .lt('created_at', resetDate.toISOString());

      return Math.max(0, 2 - (data?.length ?? 0));
    },
  });

  // Submit log mutation
  const logMutation = useMutation({
    mutationFn: async (payload: LoggingPayload) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const response = await fetch('/api/logging/log-daily', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to log');
      }

      return (await response.json()) as LoggingResponse;
    },
    onSuccess: (data) => {
      setFeedbackData(data);
      setShowFeedback(true);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['streak'] });
      queryClient.invalidateQueries({ queryKey: ['has-logged-today'] });
      queryClient.invalidateQueries({ queryKey: ['shields-remaining'] });
    },
  });

  const submitLog = useCallback(
    async (payload: LoggingPayload) => {
      return logMutation.mutateAsync(payload);
    },
    [logMutation]
  );

  return {
    // State
    currentStreak: streakData?.current_streak ?? 0,
    maxStreak: streakData?.longest_streak ?? 0,
    hasLoggedToday: hasLoggedToday ?? false,
    shieldsRemaining: shieldsData ?? 0,
    streakData,

    // Loading/Error states
    isLoading: streakLoading,
    isSubmitting: logMutation.isPending,
    error: logMutation.error?.message,

    // Feedback
    showFeedback,
    feedbackData,
    setShowFeedback,

    // Actions
    submitLog,
  };
}
