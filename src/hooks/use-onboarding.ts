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
          console.log('No user found');
          setIsLoading(false);
          return;
        }

        console.log('Checking onboarding status for user:', user.id);

        // First check localStorage for emergency bypass
        const localBypass = localStorage.getItem(`onboarding_skip_${user.id}`);
        if (localBypass === 'true') {
          console.log('User skipped onboarding via emergency bypass');
          setNeedsOnboarding(false);
          setIsLoading(false);
          return;
        }

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        console.log('Profile data:', profile, 'Error:', error);

        if (error) {
          console.error('Error fetching profile:', error);
          // If column doesn't exist, don't show onboarding
          if (error.message.includes('no rows') || error.code === 'PGRST116') {
            setNeedsOnboarding(false);
          } else {
            setNeedsOnboarding(true);
          }
        } else {
          // Explicitly check for true value (not just truthy)
          const isCompleted = profile?.onboarding_completed === true;
          console.log('Onboarding completed:', isCompleted, 'Value:', profile?.onboarding_completed);
          setNeedsOnboarding(!isCompleted);
        }
      } catch (error) {
        console.error('Error checking onboarding:', error);
        // Default to NOT showing onboarding if there's an error
        setNeedsOnboarding(false);
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
