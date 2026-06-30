'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EmotionalChips } from './EmotionalChips';

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LoggingData) => Promise<{ mockSelected: boolean }>;
  isSubmitting?: boolean;
}

export interface LoggingData {
  hours: number;
  sections: string[];
  energy: string;
  notes?: string;
  emotional_chips?: string[];
}

const HOURS_OPTIONS = [0, 1, 2, 3, 4, 5, 6];
// 'Mock' is no longer a study chip — it's now an explicit Yes/No question below,
// so it can't be missed. We still send 'Mock' inside `sections` on submit so the
// server (mock_taken = sections.includes('Mock')) and debrief flow are unchanged.
const SECTIONS = ['VARC', 'DILR', 'QA', 'Revision'];
const ENERGY_OPTIONS = [
  { emoji: '🙏', label: 'Drained', value: '🙏' },
  { emoji: '💪', label: 'Solid', value: '💪' },
  { emoji: '🔥', label: 'Sharp', value: '🔥' },
];

export function LoggingModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: LoggingModalProps) {
  const [hours, setHours] = useState<number | null>(null);
  const [sections, setSections] = useState<string[]>([]);
  const [mockTaken, setMockTaken] = useState<boolean | null>(null);
  const [energy, setEnergy] = useState<string | null>(null);
  const [emotionalChips, setEmotionalChips] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const toggleSection = (section: string) => {
    if (sections.includes(section)) {
      setSections(sections.filter((s) => s !== section));
    } else {
      setSections([...sections, section]);
    }
  };

  // Must answer the mock question; must have logged a study area OR a mock.
  const isValid =
    hours !== null && energy !== null && mockTaken !== null &&
    (mockTaken === true || sections.length > 0);

  const handleSubmit = async () => {
    if (!isValid) return;
    // Haptic confirmation on submit — feels native on mobile
    navigator.vibrate?.(50);
    try {
      setError(null);
      // Fold the explicit mock answer back into `sections` so the server and the
      // debrief redirect keep working off sections.includes('Mock').
      const finalSections = mockTaken
        ? [...sections.filter((s) => s !== 'Mock'), 'Mock']
        : sections.filter((s) => s !== 'Mock');
      const result = await onSubmit({
        hours,
        sections: finalSections,
        energy,
        notes: notes.trim() || undefined,
        emotional_chips: emotionalChips.length > 0 ? emotionalChips : undefined,
      });
      // Reset form
      setHours(null);
      setSections([]);
      setMockTaken(null);
      setEnergy(null);
      setEmotionalChips([]);
      setNotes('');
      if (!result.mockSelected) onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log. Try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-40 flex items-end sm:items-center sm:justify-center">
      <div
        className={cn(
          'w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-800',
          'max-h-[92vh] overflow-y-auto flex flex-col'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Log Today</h2>
            <p className="text-xs text-zinc-500 mt-0.5">Day ends at 3 AM — late nights count</p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 px-6 py-5 space-y-7">

          {/* Hours */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Hours studied
            </label>
            <div className="grid grid-cols-7 gap-1.5">
              {HOURS_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={cn(
                    'py-3 rounded-xl font-bold text-sm transition-all active:scale-95',
                    hours === h
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {h === 6 ? '6+' : `${h}`}
                </button>
              ))}
            </div>
            {hours === 0 && (
              <p className="text-xs text-amber-400/90 mt-2">
                0-hour logs keep your record honest — they don&apos;t extend your study streak.
              </p>
            )}
          </div>

          {/* Mock test — explicit, unmissable Yes/No (drives the debrief redirect) */}
          <div className="rounded-2xl border border-teal-700/40 bg-teal-950/30 p-4">
            <label className="block text-sm font-bold text-white mb-1">
              Did you take a mock test today?
            </label>
            <p className="text-xs text-zinc-400 mb-3">
              Your mock scores drive your analysis and your buddy&apos;s plan — log every single one.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMockTaken(false)}
                className={cn(
                  'py-3 rounded-xl font-semibold text-sm transition-all active:scale-95',
                  mockTaken === false
                    ? 'bg-zinc-700 text-white ring-2 ring-zinc-500'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                No, not today
              </button>
              <button
                type="button"
                onClick={() => setMockTaken(true)}
                className={cn(
                  'py-3 rounded-xl font-semibold text-sm transition-all active:scale-95',
                  mockTaken === true
                    ? 'bg-teal-500 text-white shadow-lg shadow-teal-500/30'
                    : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                )}
              >
                Yes, I gave a mock
              </button>
            </div>
            {mockTaken === true && (
              <p className="text-xs text-teal-400 mt-2 font-medium">
                ✓ Next you&apos;ll log your mock scores — VARC / DILR / QA + percentile.
              </p>
            )}
          </div>

          {/* Sections */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Sections studied <span className="normal-case font-normal text-zinc-600">(optional if you only gave a mock)</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTIONS.map((section) => (
                <button
                  key={section}
                  onClick={() => toggleSection(section)}
                  className={cn(
                    'px-4 py-2 rounded-full font-semibold text-sm transition-all active:scale-95',
                    sections.includes(section)
                      ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/30'
                      : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                  )}
                >
                  {section}
                </button>
              ))}
            </div>
          </div>

          {/* Energy */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Energy level
            </label>
            <div className="grid grid-cols-3 gap-2">
              {ENERGY_OPTIONS.map((e) => (
                <button
                  key={e.value}
                  onClick={() => setEnergy(e.value)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-4 rounded-2xl transition-all active:scale-95',
                    energy === e.value
                      ? 'bg-zinc-700 ring-2 ring-orange-500 ring-offset-2 ring-offset-zinc-950'
                      : 'bg-zinc-800 hover:bg-zinc-700'
                  )}
                >
                  <span className="text-3xl">{e.emoji}</span>
                  <span className="text-xs font-semibold text-zinc-300">{e.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Emotional chips */}
          <EmotionalChips selected={emotionalChips} onChange={setEmotionalChips} />

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Notes <span className="normal-case font-normal text-zinc-600">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any wins, blockers, or thoughts..."
              maxLength={200}
              rows={2}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{notes.length}/200</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-950 border border-rose-700 rounded-xl text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-4">
          <button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className={cn(
              'w-full py-4 rounded-2xl font-bold text-base transition-all flex items-center justify-center gap-2',
              isValid && !isSubmitting
                ? 'bg-orange-500 text-white hover:bg-orange-400 active:scale-[0.98] shadow-lg shadow-orange-500/20'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            )}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Logging...' : mockTaken ? 'Log & Debrief →' : 'Log Day'}
          </button>
          <p className="text-[11px] text-zinc-600 text-center mt-2">15 seconds. The app answers back.</p>
        </div>
      </div>
    </div>
  );
}
