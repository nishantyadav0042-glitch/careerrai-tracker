'use client';
/* eslint-disable react-hooks/set-state-in-effect */

import { useState, useEffect, useRef } from 'react';
import { X, Clock, CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface PuzzleContent {
  question: string;
  options: string[];
  answer: number;
  description?: string;
}

interface PuzzleSolverModalProps {
  isOpen: boolean;
  onClose: () => void;
  puzzleType: string;
  content: PuzzleContent;
  explanation?: string;
  onComplete: (result: { solved: boolean; timeSeconds: number; accuracy: number }) => Promise<void>;
}

export function PuzzleSolverModal({
  isOpen,
  onClose,
  puzzleType,
  content,
  explanation,
  onComplete,
}: PuzzleSolverModalProps) {
  const [selected, setSelected] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [saving, setSaving] = useState(false);
  const startRef = useRef<number>(0);

  useEffect(() => {
    if (!isOpen) {
      setSelected(null);
      setSubmitted(false);
      setElapsed(0);
      return;
    }
    startRef.current = Date.now();
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - startRef.current) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [isOpen]);

  if (!isOpen) return null;

  const correct = selected === content.answer;
  const mins = String(Math.floor(elapsed / 60)).padStart(1, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  const handleSubmit = async () => {
    if (selected === null || submitted) return;
    setSubmitted(true);
    setSaving(true);
    const timeSeconds = Math.max(1, Math.floor((Date.now() - startRef.current) / 1000));
    try {
      await onComplete({
        solved: selected === content.answer,
        timeSeconds,
        accuracy: selected === content.answer ? 1 : 0,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-stone-900/70 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between">
          <div>
            <span className="text-xs uppercase tracking-widest font-semibold text-orange-600">{puzzleType} puzzle</span>
            <div className="flex items-center gap-1.5 text-stone-500 text-xs mt-0.5">
              <Clock className="w-3.5 h-3.5" />
              <span className="font-mono">{mins}:{secs}</span>
            </div>
          </div>
          <button onClick={onClose} className="text-stone-400 hover:text-stone-600 p-1">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Question */}
          <p className="text-sm text-stone-900 leading-relaxed font-medium">{content.question}</p>

          {/* Options */}
          <div className="space-y-2">
            {content.options.map((opt, i) => {
              const isPicked = selected === i;
              const isAnswer = i === content.answer;
              return (
                <button
                  key={i}
                  disabled={submitted}
                  onClick={() => setSelected(i)}
                  className={cn(
                    'w-full text-left px-4 py-3 rounded-xl border-2 text-sm font-medium transition-all',
                    !submitted && isPicked && 'border-orange-600 bg-orange-50 text-stone-900',
                    !submitted && !isPicked && 'border-stone-200 hover:border-stone-300 text-stone-800',
                    submitted && isAnswer && 'border-emerald-500 bg-emerald-50 text-emerald-900',
                    submitted && isPicked && !isAnswer && 'border-rose-500 bg-rose-50 text-rose-900',
                    submitted && !isPicked && !isAnswer && 'border-stone-200 text-stone-400'
                  )}
                >
                  <span className="font-mono mr-2 text-stone-500">{String.fromCharCode(65 + i)}.</span>
                  {opt}
                  {submitted && isAnswer && <CheckCircle2 className="w-4 h-4 inline ml-2 text-emerald-600" />}
                  {submitted && isPicked && !isAnswer && <XCircle className="w-4 h-4 inline ml-2 text-rose-600" />}
                </button>
              );
            })}
          </div>

          {/* Result + explanation */}
          {submitted && (
            <div className={cn('rounded-xl p-4 text-sm', correct ? 'bg-emerald-50 border border-emerald-200' : 'bg-rose-50 border border-rose-200')}>
              <p className={cn('font-semibold mb-1', correct ? 'text-emerald-800' : 'text-rose-800')}>
                {correct ? `✅ Correct! Solved in ${mins}:${secs}` : '❌ Not quite — see why below'}
              </p>
              {explanation && <p className="text-stone-700 leading-relaxed text-xs">{explanation}</p>}
            </div>
          )}

          {/* CTA */}
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={selected === null}
              className="w-full py-3 bg-orange-600 text-white rounded-xl font-semibold text-sm hover:bg-orange-700 disabled:opacity-40 transition-all active:scale-[0.98]"
            >
              Submit answer
            </button>
          ) : (
            <button
              onClick={onClose}
              disabled={saving}
              className="w-full py-3 bg-stone-900 text-white rounded-xl font-semibold text-sm hover:bg-stone-800 disabled:opacity-50 transition-all"
            >
              {saving ? 'Saving…' : 'Done'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
