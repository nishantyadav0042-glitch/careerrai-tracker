'use client';

import { ClipboardList } from 'lucide-react';

interface PendingDebriefCardProps {
  /** When the mock was logged (ISO timestamp) — drives the 24h countdown */
  loggedAt: string;
  hasBuddy: boolean;
  onStart: () => void;
}

/**
 * The loud #1 card. When a mock is logged but not debriefed, this sits above
 * everything else on the home screen until the debrief is done.
 */
export function PendingDebriefCard({ loggedAt, hasBuddy, onStart }: PendingDebriefCardProps) {
  const hoursLeft = Math.round(24 - (Date.now() - new Date(loggedAt).getTime()) / 3_600_000);

  return (
    <button
      onClick={onStart}
      className="w-full text-left rounded-2xl bg-stone-900 text-white p-5 space-y-2 shadow-lg shadow-stone-900/20 transition-all active:scale-[0.98] hover:bg-stone-800"
    >
      <p className="text-[10px] uppercase tracking-widest font-semibold text-orange-400 flex items-center gap-1.5">
        <ClipboardList className="w-3.5 h-3.5" />
        Mock debrief · the real work
      </p>
      <p className="text-lg font-bold leading-snug">
        Debrief your mock{hasBuddy ? ' — your buddy has been notified' : ''}
      </p>
      <p className="text-xs text-stone-400 leading-relaxed">
        The 20 minutes after a mock are worth more than the 3 hours in it.
      </p>
      <div className="flex items-center justify-between pt-1">
        <span className="text-[11px] font-semibold text-amber-400">
          {hoursLeft > 0 ? `⏳ within 24h · ${hoursLeft}h left` : '⏳ overdue — do it now'}
        </span>
        <span className="text-xs font-bold text-orange-400">Start →</span>
      </div>
    </button>
  );
}
