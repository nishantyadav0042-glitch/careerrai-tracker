'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type Tab = 'profile' | 'history' | 'settings';
const TABS: { value: Tab; label: string }[] = [
  { value: 'profile', label: 'Profile' },
  { value: 'history', label: 'History' },
  { value: 'settings', label: 'Settings' },
];

function ProfilePanelTabsInner({ profile, history, settings }: { profile: ReactNode; history: ReactNode; settings: ReactNode }) {
  const searchParams = useSearchParams();
  const initial = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(() => (initial === 'history' || initial === 'settings' ? initial : 'profile'));

  return (
    <>
      <div className="grid grid-cols-3 gap-1.5 bg-stone-100 rounded-xl p-1 mb-5">
        {TABS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'py-2 rounded-lg text-sm font-semibold transition-all',
              tab === value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {tab === 'profile' && profile}
      {tab === 'history' && history}
      {tab === 'settings' && settings}
    </>
  );
}

// History and Settings used to be separate bottom-nav destinations reached
// via "More" alongside Profile itself. Folded into one panel — real
// sub-sections of "you and your account," not three competing nav slots.
export function ProfilePanelTabs(props: { profile: ReactNode; history: ReactNode; settings: ReactNode }) {
  return (
    <Suspense fallback={<div className="animate-pulse h-10 bg-stone-100 rounded-xl mb-5" />}>
      <ProfilePanelTabsInner {...props} />
    </Suspense>
  );
}
