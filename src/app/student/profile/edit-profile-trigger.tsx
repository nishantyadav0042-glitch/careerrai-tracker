'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { OnboardingModal } from '../onboarding/onboarding-modal';

export function EditProfileTrigger() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1.5 text-xs font-medium text-stone-500 hover:text-stone-900 transition-colors mt-1"
      >
        <Pencil className="w-3 h-3" />
        Edit profile
      </button>
      {/* Close locally + soft-refresh: unlike the old full reload, client
          state survives a refresh, so the modal must dismiss itself. */}
      {open && <OnboardingModal onComplete={() => { setOpen(false); router.refresh(); }} />}
    </>
  );
}
