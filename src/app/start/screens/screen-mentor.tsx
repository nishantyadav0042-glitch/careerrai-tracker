'use client';

interface Props {
  onNext: (data?: Record<string, unknown>) => void;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// Last question before the plan is built — feeds buddy-matching priority
// without inventing anything: a genuine "no" is the strongest signal we
// have that a buddy check-in will matter to this student.
export default function ScreenMentor({ onNext, onBack, canGoBack, isLoading }: Props) {
  return (
    <div className="space-y-6 pt-2">
      <div>
        <h1 className="text-2xl font-bold text-stone-900 leading-snug" style={{ fontFamily: 'Georgia, serif' }}>
          Do you have someone senior — an IIM alum, a mentor — guiding you right now?
        </h1>
        <p className="mt-2 text-sm text-stone-500">Last question. Then we build your plan.</p>
      </div>

      <div className="space-y-2.5">
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onNext({ wants_mentor: true })}
          className="w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white transition-all hover:bg-stone-800 active:scale-[0.98]"
        >
          No — I could use one
        </button>
        <button
          type="button"
          disabled={isLoading}
          onClick={() => onNext({ wants_mentor: false })}
          className="w-full rounded-2xl border-2 border-stone-200 bg-white py-4 text-sm font-semibold text-stone-700 transition-all hover:border-stone-300 active:scale-[0.98]"
        >
          Yes — I&apos;m covered
        </button>
      </div>

      {canGoBack && (
        <button onClick={onBack} disabled={isLoading} className="w-full py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors">
          Back
        </button>
      )}
    </div>
  );
}
