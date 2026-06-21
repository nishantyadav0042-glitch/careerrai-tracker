'use client';

import { useState } from 'react';
import { Pencil } from 'lucide-react';
import { OnboardingModal } from '../onboarding/onboarding-modal';

export function EditProfileTrigger() {
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
      {open && <OnboardingModal onComplete={() => window.location.reload()} />}
    </>
  );
}
