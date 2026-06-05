'use client';

import { ReactNode } from 'react';
import { useOnboarding } from '@/hooks/use-onboarding';
import { OnboardingModal } from '../onboarding/onboarding-modal';

interface StudentHomeClientProps {
  children: ReactNode;
}

export function StudentHomeClient({ children }: StudentHomeClientProps) {
  const { isLoading, needsOnboarding } = useOnboarding();

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
