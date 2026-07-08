'use client';

import { Suspense, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import { cn } from '@/lib/utils';

type Tab = 'overview' | 'chat';

function BuddyPanelTabsInner({ overview, chat, chatUnread = 0 }: { overview: ReactNode; chat: ReactNode; chatUnread?: number }) {
  const searchParams = useSearchParams();
  // Chat push notifications deep-link to /student/buddy?tab=chat (see
  // api/chat/send) — land directly on the Chat tab instead of Overview.
  const [tab, setTab] = useState<Tab>(() => (searchParams.get('tab') === 'chat' ? 'chat' : 'overview'));

  return (
    <>
      <div className="grid grid-cols-2 gap-1.5 bg-stone-100 rounded-xl p-1 mb-4">
        {([
          { value: 'overview' as const, label: 'Buddy' },
          { value: 'chat' as const, label: 'Chat' },
        ]).map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => setTab(value)}
            className={cn(
              'relative py-2 rounded-lg text-sm font-semibold transition-all',
              tab === value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500'
            )}
          >
            {label}
            {value === 'chat' && chatUnread > 0 && (
              <span className="absolute -top-1 right-1/2 translate-x-6 min-w-[16px] h-4 px-1 bg-orange-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {chatUnread > 9 ? '9+' : chatUnread}
              </span>
            )}
          </button>
        ))}
      </div>
      {/* Both stay mounted (hidden, not unmounted) — Chat holds a realtime
          subscription that shouldn't tear down and reconnect every tap. */}
      <div className={tab === 'overview' ? '' : 'hidden'}>{overview}</div>
      <div className={cn('h-[calc(100vh-220px)]', tab === 'chat' ? '' : 'hidden')}>{chat}</div>
    </>
  );
}

export function BuddyPanelTabs(props: { overview: ReactNode; chat: ReactNode; chatUnread?: number }) {
  return (
    <Suspense fallback={<div className="animate-pulse h-10 bg-stone-100 rounded-xl mb-4" />}>
      <BuddyPanelTabsInner {...props} />
    </Suspense>
  );
}
