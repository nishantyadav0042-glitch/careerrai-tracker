'use client';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// The very first screen (founder decision): one commitment micro-question
// before anything is asked of them. Saying "yes, I need this" first makes
// every later screen feel like follow-through on their own words instead
// of our form — classic consistency psychology, zero data collected.
// Both answers continue; this is a commitment device, not a filter.
export default function ScreenNeedCheck({ onNext, isLoading }: Props) {
  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          Do you feel you need a proper study plan and a tracking system?
        </h1>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onNext({ need_structure: true })}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          Yes — I need structure
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onNext({ need_structure: false })}
          className="w-full rounded-2xl border-2 border-stone-200 bg-white py-4 text-sm font-semibold text-stone-700 transition-all hover:border-stone-300 active:scale-[0.98]"
        >
          I&apos;m managing — but let&apos;s see
        </button>
      </div>
    </div>
  );
}
