'use client';

import { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { MocksSection } from './mocks-section';
import { TrendsSection } from './trends-section';

type Tab = 'trends' | 'mocks';
const TABS: { value: Tab; label: string }[] = [
  { value: 'trends', label: 'Trends' },
  { value: 'mocks', label: 'Mocks' },
];

// Mocks and Analysis used to be two separate bottom-nav destinations. Merged
// into one panel — same student question ("how am I actually doing?"),
// answered from two angles instead of two screens competing for a nav slot.
export default function AnalysisPage() {
  const [tab, setTab] = useState<Tab>('trends');

  return (
    <div className="min-h-screen bg-gradient-to-b from-stone-50 to-white p-4 sm:p-6">
      <div className="max-w-md mx-auto space-y-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Link href="/student/tracker" className="p-2 hover:bg-stone-100 rounded-lg transition-colors">
            <ArrowLeft className="w-5 h-5 text-stone-600" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
              Analysis
            </h1>
            <p className="text-sm text-stone-500">What the data says about you</p>
          </div>
        </div>

        {/* Tab switcher */}
        <div className="grid grid-cols-2 gap-1.5 bg-stone-100 rounded-xl p-1">
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

        {tab === 'trends' ? <TrendsSection /> : <MocksSection />}
      </div>
    </div>
  );
}
