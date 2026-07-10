'use client';

import dynamic from 'next/dynamic';

// Recharts is ~350 KB — lazy-load so it never blocks the Trends page shell.
// Same pattern as the student side (student/analysis/trends-section.tsx);
// next/dynamic with ssr:false must live in a client file, hence this wrapper.
const BuddyTrendsCharts = dynamic(() => import('./trends-charts'), {
  ssr: false,
  loading: () => (
    <div className="h-64 flex items-center justify-center text-xs text-stone-400">Loading charts…</div>
  ),
});

export default BuddyTrendsCharts;
