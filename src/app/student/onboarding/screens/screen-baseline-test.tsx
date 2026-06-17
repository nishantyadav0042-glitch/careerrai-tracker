'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';

interface ScreenBaselineTestProps {
  onNext: (data?: Record<string, unknown>) => Promise<void>;
  onBack: () => void;
  canGoBack: boolean;
  isLoading: boolean;
}

interface Fields {
  overall: string;
  varc: string;
  dilr: string;
  qa: string;
  mocks_taken: string;
}

function validatePercentile(value: string): string | null {
  if (value.trim() === '') return null;
  const n = parseFloat(value);
  if (isNaN(n) || n < 0 || n > 99.99) return 'Must be between 0 and 99.99';
  return null;
}

function validateMocks(value: string): string | null {
  if (value.trim() === '') return null;
  const n = parseInt(value, 10);
  if (isNaN(n) || n < 0 || n > 100) return 'Must be between 0 and 100';
  return null;
}

export default function ScreenBaselineTest({ onNext, onBack, canGoBack, isLoading }: ScreenBaselineTestProps) {
  const [saving, setSaving] = useState(false);
  const [inputError, setInputError] = useState('');
  const [fields, setFields] = useState<Fields>({
    overall: '',
    varc: '',
    dilr: '',
    qa: '',
    mocks_taken: '',
  });

  const setField = (key: keyof Fields, value: string) => {
    setFields((prev) => ({ ...prev, [key]: value }));
    setInputError('');
  };

  const anyFilled = Object.values(fields).some((v) => v.trim() !== '');

  const handleSave = async () => {
    if (anyFilled) {
      const overallErr = validatePercentile(fields.overall);
      const varcErr = validatePercentile(fields.varc);
      const dilrErr = validatePercentile(fields.dilr);
      const qaErr = validatePercentile(fields.qa);
      const mocksErr = validateMocks(fields.mocks_taken);

      const firstError = overallErr || varcErr || dilrErr || qaErr || mocksErr;
      if (firstError) {
        setInputError(firstError);
        return;
      }

      setSaving(true);
      try {
        const body: Record<string, number | null> = {
          starting_percentile: fields.overall.trim() !== '' ? parseFloat(fields.overall) : null,
          baseline_varc: fields.varc.trim() !== '' ? parseFloat(fields.varc) : null,
          baseline_dilr: fields.dilr.trim() !== '' ? parseFloat(fields.dilr) : null,
          baseline_qa: fields.qa.trim() !== '' ? parseFloat(fields.qa) : null,
          baseline_mocks_taken: fields.mocks_taken.trim() !== '' ? parseInt(fields.mocks_taken, 10) : null,
        };
        const res = await fetch('/api/profiles/baseline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          const json = await res.json().catch(() => ({}));
          setInputError(json?.error ?? 'Failed to save. Please try again.');
          setSaving(false);
          return;
        }
      } catch {
        setInputError('Network error. Please try again.');
        setSaving(false);
        return;
      }
      setSaving(false);
    }
    await onNext();
  };

  const percentileInputClass =
    'w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-base font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 appearance-none pr-12';

  return (
    <div className="space-y-6">
      <p className="text-sm text-stone-600 leading-relaxed">
        Set your starting line. Leave everything blank if you haven&apos;t taken a mock yet — you can fill this in later.
      </p>

      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
            Overall mock percentile
          </label>
          <p className="text-xs text-stone-400 mb-2">Leave blank if you haven&apos;t taken one yet.</p>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={99.99}
              step={0.01}
              placeholder="e.g. 78.5"
              value={fields.overall}
              onChange={(e) => setField('overall', e.target.value)}
              className={percentileInputClass}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
            VARC percentile
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={99.99}
              step={0.01}
              placeholder="e.g. 82.0"
              value={fields.varc}
              onChange={(e) => setField('varc', e.target.value)}
              className={percentileInputClass}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
            DILR percentile
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={99.99}
              step={0.01}
              placeholder="e.g. 71.0"
              value={fields.dilr}
              onChange={(e) => setField('dilr', e.target.value)}
              className={percentileInputClass}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
            QA percentile
          </label>
          <div className="relative">
            <input
              type="number"
              min={0}
              max={99.99}
              step={0.01}
              placeholder="e.g. 74.0"
              value={fields.qa}
              onChange={(e) => setField('qa', e.target.value)}
              className={percentileInputClass}
            />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-stone-400 text-sm font-medium">%ile</span>
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-stone-500 uppercase tracking-widest mb-2">
            How many mocks have you taken?
          </label>
          <input
            type="number"
            min={0}
            max={100}
            step={1}
            placeholder="e.g. 4"
            value={fields.mocks_taken}
            onChange={(e) => setField('mocks_taken', e.target.value)}
            className="w-full px-4 py-3 rounded-xl border border-stone-200 text-stone-900 text-base font-medium focus:outline-none focus:ring-2 focus:ring-orange-400 appearance-none"
          />
        </div>

        {inputError && <p className="text-xs text-red-600">{inputError}</p>}

        <div className="p-3 bg-orange-50 border border-orange-100 rounded-lg">
          <p className="text-xs text-orange-800">
            This is your starting line, not a verdict. Your buddy sees this to track how far you come — locked after submission.
          </p>
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        {canGoBack && (
          <button
            onClick={onBack}
            className="flex-1 py-3 border border-stone-300 rounded-xl text-sm font-medium text-stone-600 hover:bg-stone-50 transition-colors"
          >
            Back
          </button>
        )}
        <button
          onClick={handleSave}
          disabled={saving || isLoading}
          className={cn(
            'flex-1 py-3 rounded-xl font-semibold text-sm transition-all active:scale-[0.98]',
            'bg-orange-600 text-white hover:bg-orange-700 disabled:opacity-50'
          )}
        >
          {saving ? 'Saving…' : 'Save baseline & continue'}
        </button>
      </div>

      <button
        onClick={() => onNext()}
        disabled={saving || isLoading}
        className="w-full py-2 text-sm text-stone-500 hover:text-stone-700 transition-colors"
      >
        I&apos;ll add this later
      </button>
    </div>
  );
}
