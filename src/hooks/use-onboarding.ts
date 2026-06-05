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

        const { data: profile } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        // Show onboarding if not completed or field doesn't exist
        setNeedsOnboarding(!profile?.onboarding_completed);
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
