'use client';

import { OnboardingModal } from './onboarding-modal';

// Thin client wrapper so the server layout can mount the onboarding modal
// directly (status is already known server-side — no client refetch needed).
// Reloads on completion so the now-onboarded page renders without the overlay.
export function OnboardingGate() {
  return <OnboardingModal onComplete={() => window.location.reload()} />;
}
