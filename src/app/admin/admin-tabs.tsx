'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

export type AdminTab = {
  id: string;
  label: string;
  badge?: number;
  content: React.ReactNode;
};

export function AdminTabs({ tabs }: { tabs: AdminTab[] }) {
  const [active, setActive] = useState(tabs[0]?.id);
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0];

  return (
    <div>
      {/* Sticky tab bar — horizontally scrollable on mobile */}
      <div className="sticky top-0 z-20 -mx-4 mb-6 border-b border-stone-200 bg-stone-50/95 px-4 backdrop-blur">
        <div className="flex gap-1 overflow-x-auto no-scrollbar">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActive(t.id)}
              className={cn(
                '-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-colors',
                active === t.id
                  ? 'border-orange-600 text-orange-700'
                  : 'border-transparent text-stone-500 hover:text-stone-800'
              )}
            >
              {t.label}
              {typeof t.badge === 'number' && t.badge > 0 && (
                <span
                  className={cn(
                    'rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none',
                    active === t.id ? 'bg-orange-100 text-orange-700' : 'bg-stone-200 text-stone-600'
                  )}
                >
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      <div>{activeTab?.content}</div>
    </div>
  );
}
