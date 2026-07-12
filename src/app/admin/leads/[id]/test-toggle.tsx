'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { cn } from '@/lib/utils';

// One-tap "this is a test/friend account" switch. When on, the lead is hidden
// from the Leads list, the Growth funnel, and the Excel export — so founder
// and friend testing never inflates the real acquisition numbers.
export function TestToggle({ id, initial }: { id: string; initial: boolean }) {
  const router = useRouter();
  const [isTest, setIsTest] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !isTest;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/mark-test', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_test: next }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'Could not save — try again.');
        return;
      }
      setIsTest(next);
      // Refresh so the leads list / funnel reflect the change immediately.
      router.refresh();
    } catch {
      setError('Connection issue — try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={toggle}
        disabled={saving}
        className={cn(
          'rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors disabled:opacity-50',
          isTest ? 'bg-amber-100 text-amber-800 hover:bg-amber-200' : 'bg-stone-100 text-stone-500 hover:bg-stone-200'
        )}
      >
        {saving ? 'Saving…' : isTest ? '🧪 Test account · excluded' : 'Mark as test account'}
      </button>
      {isTest && !saving && (
        <span className="text-[11px] text-stone-400">Hidden from leads, funnel &amp; export</span>
      )}
      {error && <span className="text-[11px] text-rose-600">{error}</span>}
    </div>
  );
}
