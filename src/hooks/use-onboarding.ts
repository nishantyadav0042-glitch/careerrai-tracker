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

        const { data: profile, error } = await supabase
          .from('profiles')
          .select('onboarding_completed')
          .eq('id', user.id)
          .single();

        if (error) {
          // PGRST116 = no row found → genuinely new/incomplete profile → show onboarding.
          // Any other error is transient (network, RLS, cold-start) → don't interrupt a completed user.
          setNeedsOnboarding(error.code === 'PGRST116');
        } else {
          setNeedsOnboarding(profile?.onboarding_completed !== true);
        }
      } catch {
        // Unexpected JS exception (network down, etc.) — assume completed to avoid overwriting profile data.
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
      await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
      setNeedsOnboarding(false);
    } catch (error) {
      console.error('Error marking onboarding as complete:', error);
    }
  };

  return { isLoading, needsOnboarding, markAsComplete };
}
