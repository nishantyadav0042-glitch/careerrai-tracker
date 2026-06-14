'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';

export function OrientationCompleteButton({ sessionId }: { sessionId: string }) {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);

  const markDone = async () => {
    if (done || loading) return;
    setLoading(true);
    try {
      await fetch('/api/calendar/complete-orientation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId }),
      });
      setDone(true);
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <span className="flex items-center gap-1 text-xs text-emerald-600 font-semibold">
        <CheckCircle2 className="w-3.5 h-3.5" /> Done
      </span>
    );
  }

  return (
    <button
      onClick={markDone}
      disabled={loading}
      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-60"
    >
      {loading ? '…' : 'Mark done'}
    </button>
  );
}
