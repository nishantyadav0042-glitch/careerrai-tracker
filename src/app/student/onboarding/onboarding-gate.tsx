'use client';

import { useRouter } from 'next/navigation';
import { OnboardingModal } from './onboarding-modal';

// Thin client wrapper so the server layout can mount the onboarding modal
// directly (status is already known server-side — no client refetch needed).
// On completion, router.refresh() re-runs the server layout, which re-reads
// onboarding_completed and stops rendering this gate — same effect as the
// old full reload without re-downloading the entire app.
export function OnboardingGate() {
  const router = useRouter();
  return <OnboardingModal onComplete={() => router.refresh()} />;
}
