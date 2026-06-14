'use client';

import { Sunrise, X } from 'lucide-react';

interface MissRecoveryModalProps {
  missedDays: number;
  previousStreak: number;
  onRestart: () => void;
  onDismiss: () => void;
}

// The compassionate restart. A student returning after a break is bracing for
// judgment — this screen gives them welcome instead. Relief, never guilt. It is
// the single highest-retention surface in the app for our core audience.
export function MissRecoveryModal({ missedDays, previousStreak, onRestart, onDismiss }: MissRecoveryModalProps) {
  const dayWord = missedDays === 1 ? 'day' : 'days';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-sm rounded-3xl bg-white shadow-2xl overflow-hidden">
        {/* Quiet escape — never trap a returning student. */}
        <button
          onClick={onDismiss}
          aria-label="Not now"
          className="absolute top-3 right-3 p-1.5 text-stone-400 hover:text-stone-600 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="bg-gradient-to-b from-orange-50 to-white px-6 pt-8 pb-6 text-center">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-orange-100 flex items-center justify-center">
            <Sunrise className="w-7 h-7 text-orange-500" />
          </div>

          <h2 className="text-xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            You missed {missedDays} {dayWord}. Good — you&apos;re back.
          </h2>

          <p className="mt-3 text-sm text-stone-600 leading-relaxed">
            Most students who cracked CAT had multiple breaks. The break isn&apos;t the problem —
            not coming back is. Log today and restart from Day 1, stronger because you returned.
          </p>

          {previousStreak > 0 && (
            <p className="mt-3 text-xs text-stone-400">
              Your {previousStreak}-day streak got you here once. You know how to do this.
            </p>
          )}
        </div>

        <div className="px-6 pb-6">
          <button
            onClick={onRestart}
            className="w-full rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 transition-colors"
          >
            Restart Day 1
          </button>
          <button
            onClick={onDismiss}
            className="w-full mt-2 text-xs text-stone-400 hover:text-stone-600 py-1 transition-colors"
          >
            Not right now
          </button>
        </div>
      </div>
    </div>
  );
}
