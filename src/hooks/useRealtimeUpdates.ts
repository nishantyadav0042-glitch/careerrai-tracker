import { useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type RealtimePayload = {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

type RealtimeCallback = (event: RealtimePayload) => void;

interface RealtimeSubscriptionOptions {
  onInsert?: RealtimeCallback;
  onUpdate?: RealtimeCallback;
  onDelete?: RealtimeCallback;
}

/**
 * Hook for subscribing to real-time updates from Supabase
 * Usage:
 *   useRealtimeUpdates('daily_logs', 'student_id=eq.abc123', {
 *     onInsert: (event) => console.log('New log:', event.new),
 *   })
 */
export function useRealtimeUpdates(
  table: string,
  filter: string,
  callbacks: RealtimeSubscriptionOptions
) {
  const supabase = createClient();

  useEffect(() => {
    const subscription = supabase
      .channel(`${table}:${filter}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table,
          filter,
        },
        (payload) => callbacks.onInsert?.(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table,
          filter,
        },
        (payload) => callbacks.onUpdate?.(payload)
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table,
          filter,
        },
        (payload) => callbacks.onDelete?.(payload)
      )
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [table, filter, callbacks, supabase]);
}

/**
 * Hook for live leaderboard updates
 * Shows top students by streak in real-time
 */
export function useStreakLeaderboard() {
  const supabase = createClient();

  const subscribe = useCallback(
    (
      onUpdate: (event: {
        eventType: 'INSERT' | 'UPDATE' | 'DELETE';
        new?: Record<string, unknown>;
        old?: Record<string, unknown>;
      }) => void
    ) => {
      const subscription = supabase
        .channel('streak_data:updates')
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'streak_data',
          },
          (payload) => {
            onUpdate({
              eventType: payload.eventType,
              new: payload.new,
              old: payload.old,
            });
          }
        )
        .subscribe();

      return () => subscription.unsubscribe();
    },
    [supabase]
  );

  return { subscribe };
}

/**
 * Hook for live notifications
 * Shows incoming buddy messages, milestones, etc.
 */
export function useLiveNotifications(userId: string) {
  const supabase = createClient();

  const subscribe = useCallback(
    (
      onNew: (notification: Record<string, unknown>) => void
    ) => {
      const subscription = supabase
        .channel(`notifications:user_id=eq.${userId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `user_id=eq.${userId}`,
          },
          (payload) => {
            onNew(payload.new);
          }
        )
        .subscribe();

      return () => subscription.unsubscribe();
    },
    [userId, supabase]
  );

  return { subscribe };
}
