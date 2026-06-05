/**
 * Hook for managing onboarding state
 * Checks if user has completed onboarding
 */

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export function useOnboarding() {
  const supabase = createClient();
  const [isLoading, setIsLoading] = useState(true);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    async function checkOnboarding() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setIsLoading(false);
          return;
        }

        // Add cache busting with timestamp to force fresh data
        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        if (error) {
          console.error('Error fetching profile:', error);
          setNeedsOnboarding(true);
        } else {
          // Explicitly check for true value (not just truthy)
          const isCompleted = profile?.onboarding_completed === true;
          setNeedsOnboarding(!isCompleted);
        }
      } catch (error) {
        console.error('Error checking onboarding:', error);
        // Default to showing onboarding if we can't check
        setNeedsOnboarding(true);
      } finally {
        setIsLoading(false);
      }
    }

    checkOnboarding();
  }, [supabase]);

  const markAsComplete = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      await supabase
        .from('profiles')
        .update({ onboarding_completed: true })
        .eq('id', user.id);

      setNeedsOnboarding(false);
    } catch (error) {
      console.error('Error marking onboarding as complete:', error);
    }
  };

  return {
    isLoading,
    needsOnboarding,
    markAsComplete
  };
}
