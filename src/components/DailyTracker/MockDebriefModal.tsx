'use client';

import { useState, useRef } from 'react';
import { X, Loader2, Plus, Minus, Camera, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MockDebriefData {
  varc: { attempted: number; correct: number; time_min: number; percentile: number | null };
  dilr: { attempted: number; correct: number; time_min: number; percentile: number | null };
  qa: { attempted: number; correct: number; time_min: number; percentile: number | null };
  error_buckets: { conceptual: number; silly: number; time: number; panic: number; selection: number };
  strategy_note: string;
  overall_percentile: number | null;
}

interface MockDebriefModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: MockDebriefData) => Promise<void>;
  isSubmitting?: boolean;
  logDate: string;
}

const ERROR_BUCKETS = [
  { key: 'conceptual' as const, emoji: '🧠', label: 'Knowledge gap', desc: 'Concept or formula not known' },
  { key: 'silly' as const, emoji: '⚠️', label: 'Execution error', desc: 'Concept clear; error in working steps' },
  { key: 'time' as const, emoji: '⏱️', label: 'Time misallocation', desc: 'Insufficient time allocated to question' },
  { key: 'panic' as const, emoji: '↩️', label: 'Misread / framing error', desc: 'Question or data misinterpreted' },
  { key: 'selection' as const, emoji: '✗', label: 'Selection error', desc: 'Question should not have been attempted' },
];

const SECTIONS = [
  { key: 'varc' as const, label: 'VARC', color: 'teal' },
  { key: 'dilr' as const, label: 'DILR', color: 'orange' },
  { key: 'qa' as const, label: 'QA', color: 'indigo' },
];

type SectionKey = 'varc' | 'dilr' | 'qa';
type SectionData = { attempted: number; correct: number; time_min: number; percentile: number | null };

function SectionAccordion({
  sectionKey,
  label,
  color,
  data,
  onChange,
}: {
  sectionKey: SectionKey;
  label: string;
  color: string;
  data: SectionData;
  onChange: (key: SectionKey, field: keyof SectionData, val: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const accuracy = data.attempted > 0 ? Math.round((data.correct / data.attempted) * 100) : null;

  const colorMap: Record<string, string> = {
    teal: 'bg-teal-500',
    orange: 'bg-orange-500',
    indigo: 'bg-indigo-500',
  };

  return (
    <div className="bg-zinc-900 rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-2.5 h-2.5 rounded-full', colorMap[color])} />
          <span className="font-semibold text-white text-sm">{label}</span>
          {data.percentile !== null && (
            <span className="text-xs text-zinc-400">{data.percentile}%ile</span>
          )}
          {accuracy !== null && (
            <span className="text-xs text-zinc-500">{data.correct}/{data.attempted} ({accuracy}%)</span>
          )}
        </div>
        <span className="text-zinc-500 text-xs">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-zinc-800 px-4 py-4 grid grid-cols-2 gap-3">
          {(
            [
              { field: 'attempted' as const, label: 'Attempted' },
              { field: 'correct' as const, label: 'Correct' },
              { field: 'time_min' as const, label: 'Time (min)' },
              { field: 'percentile' as const, label: 'Percentile' },
            ] as const
          ).map(({ field, label: fLabel }) => (
            <div key={field}>
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider font-semibold block mb-1">
                {fLabel}
              </label>
              <input
                type="number"
                inputMode="numeric"
                value={data[field] ?? ''}
                onChange={(e) =>
                  onChange(sectionKey, field, e.target.value === '' ? null : Number(e.target.value))
                }
                min={0}
                max={field === 'percentile' ? 100 : undefined}
                placeholder="—"
                className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Counter({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:bg-zinc-700 active:scale-90 transition-all"
      >
        <Minus className="w-3.5 h-3.5" />
      </button>
      <span className="w-8 text-center font-bold text-white text-lg font-mono">{value}</span>
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 hover:bg-zinc-700 active:scale-90 transition-all"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

const defaultSection = (): SectionData => ({ attempted: 0, correct: 0, time_min: 0, percentile: null });

interface ParsedSection {
  attempted: number | null;
  correct: number | null;
  time_min: number | null;
  percentile: number | null;
}

interface ParsedScorecard {
  mock_name: string | null;
  overall_percentile: number | null;
  varc: ParsedSection;
  dilr: ParsedSection;
  qa: ParsedSection;
}

/** Downscale to max 1568px long edge and re-encode as JPEG so uploads stay small. */
async function fileToBase64Jpeg(file: File): Promise<{ data: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const MAX_EDGE = 1568;
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();

  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  return { data: dataUrl.split(',')[1], mediaType: 'image/jpeg' };
}

export function MockDebriefModal({
  isOpen,
  onClose,
  onSubmit,
  isSubmitting = false,
  logDate,
}: MockDebriefModalProps) {
  const [sections, setSections] = useState<Record<SectionKey, SectionData>>({
    varc: defaultSection(),
    dilr: defaultSection(),
    qa: defaultSection(),
  });

  const [buckets, setBuckets] = useState({
    conceptual: 0,
    silly: 0,
    time: 0,
    panic: 0,
    selection: 0,
  });

  const [overallPercentile, setOverallPercentile] = useState<number | null>(null);
  const [strategyNote, setStrategyNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [scanError, setScanError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleScorecardUpload = async (file: File) => {
    setScanning(true);
    setScanError(null);
    setScanResult(null);
    try {
      const { data, mediaType } = await fileToBase64Jpeg(file);
      const res = await fetch('/api/parse-scorecard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: data, mediaType }),
      });
      const json = await res.json();
      if (!res.ok) {
        setScanError(json.error ?? 'Could not read the scorecard — fill in manually.');
        return;
      }
      const sc = json.scorecard as ParsedScorecard;
      if (sc.overall_percentile != null) setOverallPercentile(sc.overall_percentile);
      setSections((prev) => {
        const next = { ...prev };
        for (const key of ['varc', 'dilr', 'qa'] as const) {
          const s = sc[key];
          if (!s) continue;
          next[key] = {
            attempted: s.attempted ?? prev[key].attempted,
            correct: s.correct ?? prev[key].correct,
            time_min: s.time_min ?? prev[key].time_min,
            percentile: s.percentile ?? prev[key].percentile,
          };
        }
        return next;
      });
      setScanResult(sc.mock_name ? `Read ${sc.mock_name} ✓ — check the numbers below` : 'Scorecard read ✓ — check the numbers below');
    } catch (e) {
      console.error('scorecard scan error', e);
      setScanError('Could not read the image — fill in manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleSectionChange = (key: SectionKey, field: keyof SectionData, val: number | null) => {
    setSections((prev) => ({
      ...prev,
      [key]: { ...prev[key], [field]: val === null ? (field === 'percentile' ? null : 0) : val },
    }));
  };

  const totalErrors = Object.values(buckets).reduce((a, b) => a + b, 0);

  const handleSubmit = async () => {
    try {
      setError(null);
      await onSubmit({
        varc: sections.varc,
        dilr: sections.dilr,
        qa: sections.qa,
        error_buckets: buckets,
        strategy_note: strategyNote.trim(),
        overall_percentile: overallPercentile,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save debrief. Try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-end sm:items-center sm:justify-center">
      <div
        className={cn(
          'w-full max-w-md bg-zinc-950 rounded-t-3xl sm:rounded-3xl shadow-2xl border border-zinc-800',
          'max-h-[92vh] overflow-y-auto flex flex-col'
        )}
      >
        {/* Header */}
        <div className="sticky top-0 bg-zinc-950 border-b border-zinc-800 px-6 py-5 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Mock Debrief</h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              {new Date(logDate + 'T00:00:00').toLocaleDateString('en-IN', {
                weekday: 'long',
                day: 'numeric',
                month: 'short',
              })}
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-zinc-500 hover:text-zinc-300 transition disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 px-6 py-5 space-y-7">
          {/* Scorecard scan — AI prefill */}
          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleScorecardUpload(f);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={scanning || isSubmitting}
              className={cn(
                'w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-sm transition-all',
                'bg-gradient-to-r from-indigo-600 to-violet-600 text-white hover:from-indigo-500 hover:to-violet-500',
                'active:scale-[0.98] disabled:opacity-60'
              )}
            >
              {scanning ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Reading scorecard…
                </>
              ) : (
                <>
                  <Camera className="w-4 h-4" />
                  Scan scorecard screenshot
                  <Sparkles className="w-3.5 h-3.5 opacity-70" />
                </>
              )}
            </button>
            <p className="text-[11px] text-zinc-600 text-center mt-1.5">
              Works with SIMCAT, AIMCAT, CL & more — AI fills the numbers for you
            </p>
            {scanResult && (
              <p className="text-xs text-teal-400 text-center mt-1">{scanResult}</p>
            )}
            {scanError && (
              <p className="text-xs text-rose-400 text-center mt-1">{scanError}</p>
            )}
          </div>

          {/* Overall percentile */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Overall percentile
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={overallPercentile ?? ''}
              onChange={(e) =>
                setOverallPercentile(e.target.value === '' ? null : Number(e.target.value))
              }
              min={0}
              max={100}
              placeholder="e.g. 87"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-lg font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
            />
          </div>

          {/* Per-section stats */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Section breakdown <span className="normal-case font-normal text-zinc-600">(tap to expand)</span>
            </label>
            <div className="space-y-2">
              {SECTIONS.map(({ key, label, color }) => (
                <SectionAccordion
                  key={key}
                  sectionKey={key}
                  label={label}
                  color={color}
                  data={sections[key]}
                  onChange={handleSectionChange}
                />
              ))}
            </div>
          </div>

          {/* Error buckets */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-xs font-semibold text-zinc-400 uppercase tracking-widest">
                Error classification
              </label>
              {totalErrors > 0 && (
                <span className="text-xs text-zinc-500">{totalErrors} errors tagged</span>
              )}
            </div>
            <div className="space-y-2">
              {ERROR_BUCKETS.map(({ key, emoji, label, desc }) => (
                <div
                  key={key}
                  className="flex items-center justify-between bg-zinc-900 rounded-2xl px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{emoji}</span>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white">{label}</p>
                      <p className="text-xs text-zinc-500 truncate">{desc}</p>
                    </div>
                  </div>
                  <Counter
                    value={buckets[key]}
                    onChange={(v) => setBuckets((prev) => ({ ...prev, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Strategy note */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Corrective action
            </label>
            <textarea
              value={strategyNote}
              onChange={(e) => setStrategyNote(e.target.value)}
              placeholder="One specific change for the next mock..."
              maxLength={300}
              rows={3}
              className="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-xl text-sm text-zinc-200 placeholder-zinc-600 focus:outline-none focus:border-zinc-500 resize-none"
            />
            <p className="text-xs text-zinc-600 mt-1 text-right">{strategyNote.length}/300</p>
          </div>

          {error && (
            <div className="p-3 bg-rose-950 border border-rose-700 rounded-xl text-sm text-rose-300">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="sticky bottom-0 bg-zinc-950 border-t border-zinc-800 px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="flex-1 py-3.5 border border-zinc-700 rounded-2xl font-semibold text-zinc-400 hover:bg-zinc-900 transition disabled:opacity-50"
          >
            Skip
          </button>
          <button
            onClick={handleSubmit}
            disabled={isSubmitting}
            className={cn(
              'flex-[2] py-3.5 rounded-2xl font-bold transition-all flex items-center justify-center gap-2',
              !isSubmitting
                ? 'bg-teal-500 text-white hover:bg-teal-400 active:scale-[0.98] shadow-lg shadow-teal-500/20'
                : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
            )}
          >
            {isSubmitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isSubmitting ? 'Saving...' : 'Save Debrief'}
          </button>
        </div>
      </div>
    </div>
  );
}
