'use client';

import { Sparkles } from 'lucide-react';

interface Props {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

// The cover — replaces a generic "Welcome to CareerRai." The word
// "onboarding" never appears anywhere a student sees it: what follows is
// framed as building something, not filling out a form, because that's
// what actually determines whether this becomes a daily habit or another
// forgotten app.
export default function ScreenBlueprintIntro({ onNext, isLoading }: Props) {
  return (
    <div className="space-y-7 text-center py-4">
      <div className="flex flex-col items-center gap-3">
        <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center shadow-lg">
          <Sparkles className="w-7 h-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-stone-900 leading-tight" style={{ fontFamily: 'Georgia, serif' }}>
          Let&apos;s build your<br />CAT Blueprint
        </h1>
        <p className="text-sm text-stone-500">The only thing you need before starting CAT prep. 2–4 minutes.</p>
      </div>

      <div className="bg-orange-50 rounded-2xl border border-orange-100 p-5 space-y-3 text-left">
        {[
          "You'll know exactly what to study every day.",
          "You'll never have to plan again.",
          'CareerRai will adapt with you until CAT.',
        ].map((line) => (
          <div key={line} className="flex items-start gap-2.5">
            <span className="text-orange-600 font-bold shrink-0 mt-0.5">✓</span>
            <p className="text-sm text-stone-800">{line}</p>
          </div>
        ))}
      </div>

      <button
        onClick={() => onNext()}
        disabled={isLoading}
        className="w-full py-3.5 bg-orange-600 text-white rounded-2xl font-semibold text-sm hover:bg-orange-700 active:scale-[0.98] transition-all disabled:opacity-60"
      >
        Start Building →
      </button>

      {/* Endowed progress, truthfully: the account IS section one. */}
      <p className="text-xs text-stone-400">Your account is in — 1 of 4 sections already done.</p>
    </div>
  );
}
