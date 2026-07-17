'use client';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  isLoading: boolean;
}

// First screen of the pre-auth funnel — before any signup field. Founder
// wants a "fun fact" here, but standing rule is no invented statistics: this
// stays a straight, honest claim instead of a manufactured percentage.
export default function ScreenNeedCheck({ onNext, isLoading }: Props) {
  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          Do you feel you need a proper study plan and a tracking system to crack CAT?
        </h1>
        <p className="mt-2 text-sm text-stone-500">Honest answer — it changes how we build yours.</p>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onNext({ need_structure: true })}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          Yes — I need one
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onNext({ need_structure: false })}
          className="w-full rounded-2xl border-2 border-stone-200 bg-white py-4 text-sm font-semibold text-stone-700 transition-all hover:border-stone-300 active:scale-[0.98]"
        >
          I&apos;m managing on my own
        </button>
      </div>

      <p className="text-center text-[11px] leading-relaxed text-stone-400">
        Toppers who prepare with a written plan and daily accountability are the ones who show up consistently on exam day — not the ones with the most hours.
      </p>
    </div>
  );
}
