'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

// Re-runs the server component on an interval so a live ops page stays current
// without a manual refresh. router.refresh() re-fetches server data in place —
// no full reload, no scroll jump.
export function AutoRefresh({ seconds = 60 }: { seconds?: number }) {
  const router = useRouter();
  useEffect(() => {
    const id = setInterval(() => router.refresh(), seconds * 1000);
    return () => clearInterval(id);
  }, [router, seconds]);
  return null;
}
