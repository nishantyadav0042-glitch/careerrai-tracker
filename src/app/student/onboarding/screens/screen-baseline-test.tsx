'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { BarChart2 } from 'lucide-react';

interface ScreenBaselineTestProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

export default function ScreenBaselineTest({ onNext, isLoading }: ScreenBaselineTestProps) {
  const supabase = createClient();
  const [percentile, setPercentile] = useState('');
  const [saving, setSaving] = useState(false);
  const [inputError, setInputError] = useState('');

  const handleSave = async () => {
    const raw = percentile.trim();
    if (raw !== '') {
      const p = parseFloat(raw);
      if (isNaN(p) || p < 0 || p >= 100) {
        setInputError('Enter a number between 0 and 99.99');
        return;
      }
      setSaving(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await supabase.from('profiles').update({ starting_percentile: p }).eq('id', user.id);
      }
      setSaving(false);
    }
    await onNext();
  };

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-orange-600 font-semibold uppercase tracking-wider">Your Baseline</p>
        <p className="text-xs text-stone-500 mt-1">Helps us track your progress over time</p>
      </div>

      <div className="flex justify-center">
        <BarChart2 className="w-16 h-16 text-orange-600" />
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-semibold text-stone-800 mb-1.5">
            What percentile did you score in your most recent CAT mock?
          </label>
          <p className="text-xs text-stone-500 mb-3">
            Leave blank if you haven&apos;t taken one yet — you can update this anytime.
          </p>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="99.99"
              step="0.01"
              placeholder="e.g. 78.5"
              value={percentile}
              onChange={(e) => { setPercentile(e.target.value); setInputError(''); }}
              className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-lg font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 appearance-none"
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
          </div>
          {inputError && <p className="text-xs text-red-600 mt-1">{inputError}</p>}
        </div>

        <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
          <p className="text-xs text-orange-800">
            This sets your <span className="font-semibold">starting point</span>. Your buddy will track your improvement from here — this is the north-star metric.
          </p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving || isLoading}
          type="button"
          className="w-full py-3 bg-orange-600 text-white rounded-xl font-medium hover:bg-orange-700 transition-all disabled:opacity-50 cursor-pointer"
        >
          {saving ? 'Saving…' : percentile.trim() ? 'Save & Continue' : 'Continue'}
        </button>

        <button
          onClick={() => onNext()}
          disabled={saving || isLoading}
          type="button"
          className="w-full py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors cursor-pointer"
        >
          I&apos;ll add this later
        </button>
      </div>
    </div>
  );
}
