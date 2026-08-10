'use client';

import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

// "Reset my study plan" (founder S3): wipe today's routine + ticks and rebuild
// the day fresh from current hours/coverage/timetable. Past days untouched.
export function PlanResetButton() {
  const [busy, setBusy] = useState(false);

  async function reset() {
    if (!window.confirm("Rebuild today's plan from scratch? Today's tick marks are cleared — past days and your streak are untouched.")) return;
    setBusy(true);
    try {
      const res = await fetch('/api/routine/reset', { method: 'POST' });
      if (res.ok) { window.location.reload(); return; }
    } catch { /* fall through to re-enable */ }
    setBusy(false);
  }

  return (
    <button
      type="button"
      onClick={() => void reset()}
      disabled={busy}
      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white py-2.5 text-[13px] font-semibold text-stone-700 transition-colors hover:border-stone-900 disabled:opacity-50"
    >
      <RotateCcw className="h-4 w-4" />
      {busy ? 'Rebuilding…' : "Reset today's plan"}
    </button>
  );
}
