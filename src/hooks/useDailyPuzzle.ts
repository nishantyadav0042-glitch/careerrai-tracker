import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@/lib/supabase/client';
import type { DailyLrdiPuzzle, LrdiPuzzleAttempt } from '@/types';

export function useDailyPuzzle(studentId: string) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  // Fetch today's puzzle
  const { data: todayPuzzle, isLoading: puzzleLoading } = useQuery({
    queryKey: ['daily-puzzle-today'],
    queryFn: async () => {
      const today = new Date().toISOString().split('T')[0];

      const { data, error } = await supabase
        .from('daily_lrdi_puzzles')
        .select('*')
        .eq('puzzle_date', today)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return data as DailyLrdiPuzzle | null;
    },
  });

  // Fetch student's attempt on today's puzzle
  const { data: studentAttempt } = useQuery({
    queryKey: ['puzzle-attempt', todayPuzzle?.id],
    enabled: !!todayPuzzle,
    queryFn: async () => {
      if (!todayPuzzle) return null;

      const { data } = await supabase
        .from('lrdi_puzzle_attempts')
        .select('*')
        .eq('student_id', studentId)
        .eq('puzzle_id', todayPuzzle.id)
        .single();

      return data as LrdiPuzzleAttempt | null;
    },
  });

  // Submit puzzle attempt
  const submitAttemptMutation = useMutation({
    mutationFn: async (payload: {
      solved: boolean;
      timeTaken?: number;
      accuracy?: number;
    }) => {
      if (!todayPuzzle) throw new Error('No puzzle today');

      // Upsert attempt
      const { data, error } = await supabase
        .from('lrdi_puzzle_attempts')
        .upsert(
          {
            student_id: studentId,
            puzzle_id: todayPuzzle.id,
            ...payload,
          },
          { onConflict: 'student_id,puzzle_id' }
        )
        .select()
        .single();

      if (error) throw error;
      return data as LrdiPuzzleAttempt;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['puzzle-attempt'] });
    },
  });

  return {
    puzzle: todayPuzzle,
    attempt: studentAttempt,
    isLoading: puzzleLoading,
    isSubmitting: submitAttemptMutation.isPending,
    submitAttempt: submitAttemptMutation.mutateAsync,
  };
}
