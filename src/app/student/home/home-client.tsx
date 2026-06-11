'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { ReactNode, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { useOnboarding } from '@/hooks/use-onboarding';
import { OnboardingModal } from '../onboarding/onboarding-modal';
import { QuickLogSheet } from './quick-log-sheet';
import { StreakGuard } from './streak-guard';

interface StudentHomeClientProps {
  children: ReactNode;
}

export function StudentHomeClient({ children }: StudentHomeClientProps) {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const { isLoading, needsOnboarding } = useOnboarding();

  const [userId, setUserId] = useState<string | null>(null);
  const [isQuickLogOpen, setIsQuickLogOpen] = useState(false);

  useEffect(() => {
    // Get user ID
    async function getUser() {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    }
    getUser();
  }, [supabase]);

  useEffect(() => {
    // Check if quick log should open
    if (searchParams.get('openQuickLog') === 'true') {
      setIsQuickLogOpen(true);
      // Remove the query param
      window.history.replaceState({}, '', '/student/home');
    }
  }, [searchParams]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-12 h-12 bg-orange-100 rounded-full mx-auto mb-3 animate-pulse" />
          <p className="text-sm text-stone-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {children}

      {userId && (
        <>
          <QuickLogSheet
            isOpen={isQuickLogOpen}
            onClose={() => setIsQuickLogOpen(false)}
            userId={userId}
          />
          <StreakGuard
            userId={userId}
            onLogClick={() => setIsQuickLogOpen(true)}
          />
        </>
      )}

      {needsOnboarding && (
        <OnboardingModal
          onComplete={() => {
            // Reload the page to show home content
            window.location.reload();
          }}
        />
      )}
    </>
  );
}
