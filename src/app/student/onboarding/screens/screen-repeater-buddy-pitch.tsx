'use client';

// Repeater-only reassurance (founder, 23 Jul). Shown right after the
// commitment screen (finish-date + hours) and before the general Meet-Buddy
// screen — ONLY to students who marked themselves a repeater. Uses what they
// just told us (last year's percentile, whether they had real support) to
// make the ₹999 IIM buddy offer land as relief, not a sales pitch.
interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
  lastYearPercentile: number | null;
  hadBuddyLastYear: boolean | null;
}

export default function ScreenRepeaterBuddyPitch({ onNext, onBack, canGoBack, isLoading, lastYearPercentile, hadBuddyLastYear }: Props) {
  const alone = hadBuddyLastYear === false;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-orange-100 text-3xl">🤝</div>
        <h2 className="text-lg font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
          {alone ? "You went through it alone last year. That changes now." : "You've got this — and now you've got backup too."}
        </h2>
        {lastYearPercentile != null && (
          <p className="mt-1 text-sm text-stone-600">{lastYearPercentile}%ile last year.</p>
        )}
      </div>

      <div className="rounded-2xl border border-orange-200 bg-orange-50/60 p-4">
        <p className="text-sm leading-relaxed text-stone-700">
          Don&apos;t worry — at <span className="font-semibold text-stone-900">CareerRai</span> you get a real{' '}
          <span className="font-semibold text-stone-900">IIM buddy</span> for just{' '}
          <span className="font-bold text-orange-700">₹999</span> — they review your prep and every mock.
        </p>
      </div>

      <p className="text-center text-sm font-medium text-stone-600">
        Thank you for trusting us with your second attempt. Let&apos;s make it count.
      </p>

      <div className="sticky bottom-0 z-20 flex gap-3 bg-white/95 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        {canGoBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Back
          </button>
        )}
        <button
          onClick={() => onNext()}
          disabled={isLoading}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-orange-600 text-white hover:bg-orange-700 transition-all active:scale-[0.98] disabled:opacity-50"
        >
          Continue →
        </button>
      </div>
    </div>
  );
}
