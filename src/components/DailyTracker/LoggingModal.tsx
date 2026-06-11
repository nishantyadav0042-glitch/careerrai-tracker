'use client';

import { useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface LoggingModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: LoggingData) => Promise<void>;
  isSubmitting?: boolean;
}

export interface LoggingData {
  hours: number;
  topics: string[];
  mood: string;
  mockScore?: { percentile: number; time: number };
  notes?: string;
}

const HOURS_OPTIONS = [0, 1, 2, 3, 4];
const TOPICS = ['LRDI', 'VARC', 'QA', 'Overall'];
const MOODS = ['🙏', '💪', '🙌'];

export function LoggingModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
}: LoggingModalProps) {
  const [hours, setHours] = useState<number | null>(null);
  const [topics, setTopics] = useState<string[]>([]);
  const [mood, setMood] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [showMockExpander, setShowMockExpander] = useState(false);
  const [mockPercentile, setMockPercentile] = useState<number | null>(null);
  const [mockTime, setMockTime] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggleTopic = (topic: string) => {
    if (topics.includes(topic)) {
      setTopics(topics.filter((t) => t !== topic));
    } else if (topics.length < 3) {
      setTopics([...topics, topic]);
    }
  };

  const isValid = hours !== null && topics.length > 0 && mood !== null;

  const handleSubmit = async () => {
    if (!isValid) return;

    try {
      setError(null);
      const data: LoggingData = {
        hours,
        topics,
        mood,
        notes: notes.trim() || undefined,
      };

      if (mockPercentile !== null && mockTime !== null) {
        data.mockScore = { percentile: mockPercentile, time: mockTime };
      }

      await onSubmit(data);

      // Reset form
      setHours(null);
      setTopics([]);
      setMood(null);
      setNotes('');
      setShowMockExpander(false);
      setMockPercentile(null);
      setMockTime(null);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log. Try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 flex items-end sm:items-center sm:justify-center p-4">
      <div
        className={cn(
          'w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl shadow-2xl',
          'max-h-[90vh] overflow-y-auto flex flex-col'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-stone-200 p-6 sm:p-8 flex items-center justify-between">
          <h2 className="text-2xl font-bold text-stone-900" style={{ fontFamily: 'Georgia, serif' }}>
            Log Today
          </h2>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-stone-400 hover:text-stone-600 transition disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 p-6 sm:p-8 space-y-6">
          {/* Hours Selector */}
          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-3">
              How many hours did you study?
            </label>
            <div className="grid grid-cols-5 gap-2">
              {HOURS_OPTIONS.map((h) => (
                <button
                  key={h}
                  onClick={() => setHours(h)}
                  className={cn(
                    'py-3 px-2 rounded-lg font-semibold text-sm transition-all active:scale-95',
                    hours === h
                      ? 'bg-orange-600 text-white shadow-lg'
                      : 'bg-stone-100 text-stone-900 hover:bg-stone-200'
                  )}
                >
                  {h}h
                </button>
              ))}
            </div>
          </div>

          {/* Topics Selector */}
          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-3">
              Topics covered (up to 3)
            </label>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map((topic) => (
                <button
                  key={topic}
                  onClick={() => toggleTopic(topic)}
                  disabled={topics.length >= 3 && !topics.includes(topic)}
                  className={cn(
                    'px-4 py-2 rounded-full font-medium text-sm transition-all active:scale-95',
                    topics.includes(topic)
                      ? 'bg-teal-600 text-white shadow-lg'
                      : 'bg-stone-100 text-stone-900 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-stone-200'
                  )}
                >
                  {topic}
                </button>
              ))}
            </div>
            <p className="text-xs text-stone-500 mt-2">
              {topics.length}/3 selected
            </p>
          </div>

          {/* Mood Selector */}
          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-3">
              How are you feeling?
            </label>
            <div className="flex gap-4">
              {MOODS.map((m) => (
                <button
                  key={m}
                  onClick={() => setMood(m)}
                  className={cn(
                    'text-5xl p-4 rounded-2xl transition-all active:scale-90',
                    mood === m
                      ? 'bg-orange-100 scale-110'
                      : 'bg-stone-100 hover:bg-stone-200'
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            <div className="flex gap-2 mt-3 text-xs text-stone-600">
              <span>🙏 Tired</span>
              <span>💪 Strong</span>
              <span>🙌 Great</span>
            </div>
          </div>

          {/* Notes (optional) */}
          <div>
            <label className="block text-sm font-semibold text-stone-900 mb-2">
              Notes (optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any thoughts? Blockers? Wins?"
              maxLength={200}
              rows={3}
              className="w-full px-4 py-3 bg-stone-50 border border-stone-200 rounded-lg text-sm focus:outline-none focus:border-stone-900 resize-none"
            />
            <p className="text-xs text-stone-500 mt-1">
              {notes.length}/200
            </p>
          </div>

          {/* Mock Score Expander */}
          <button
            onClick={() => setShowMockExpander(!showMockExpander)}
            className="text-sm text-teal-700 font-medium hover:underline"
          >
            {showMockExpander ? '▼' : '▶'} Did you take a mock today?
          </button>

          {showMockExpander && (
            <div className="space-y-3 bg-teal-50 rounded-lg p-4">
              <div>
                <label className="text-sm font-semibold text-stone-900 block mb-2">
                  Percentile
                </label>
                <input
                  type="number"
                  value={mockPercentile ?? ''}
                  onChange={(e) => setMockPercentile(e.target.value ? parseInt(e.target.value) : null)}
                  min="0"
                  max="100"
                  placeholder="e.g., 85"
                  className="w-full px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm focus:outline-none focus:border-teal-600"
                />
              </div>
              <div>
                <label className="text-sm font-semibold text-stone-900 block mb-2">
                  Time spent (minutes)
                </label>
                <input
                  type="number"
                  value={mockTime ?? ''}
                  onChange={(e) => setMockTime(e.target.value ? parseInt(e.target.value) : null)}
                  min="0"
                  placeholder="e.g., 120"
                  className="w-full px-3 py-2 bg-white border border-teal-200 rounded-lg text-sm focus:outline-none focus:border-teal-600"
                />
              </div>
            </div>
          )}

          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-sm text-rose-700">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-stone-50 border-t border-stone-200 p-6 sm:p-8 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3 border border-stone-300 rounded-xl font-semibold text-stone-900 hover:bg-stone-100 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!isValid || isSubmitting}
            className={cn(
              'flex-1 py-3 rounded-xl font-semibold transition-all flex items-center justify-center gap-2',
              isValid && !isSubmitting
                ? 'bg-orange-600 text-white hover:bg-orange-700 active:scale-[0.98]'
                : 'bg-stone-300 text-stone-500 cursor-not-allowed'
            )}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Submitting...' : 'Submit'}
          </button>
        </div>
      </div>
    </div>
  );
}
