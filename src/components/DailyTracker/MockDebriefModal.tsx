'use client';

import { useState, useRef } from 'react';
import { prepareImage } from '@/lib/image-downscale';
import { X, Loader2, Camera, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

// Simplified (founder, 23 Jul): error classification (5-bucket tagging) was
// too much effort for a student to fill in after a mock — nobody would. Down
// to what a student will actually do: overall percentile, one percentile per
// section, one observation.
//
// That remains the MANUAL contract (22 Aug). What changed is the scanned one:
// when the scorecard is read by the parser, the student types nothing, so
// there is no friction argument for discarding accuracy and time. Those are
// kept now.
/** A section as we store it. attempted/correct/time_min are what make a mock
 *  DIAGNOSTIC rather than a scoreboard: percentile says you did badly, accuracy
 *  and time say why. They are optional because a hand-typed entry may only
 *  carry a percentile — but when the scanner reads them, we keep them. */
export interface MockSectionData {
  percentile: number | null;
  attempted?: number | null;
  correct?: number | null;
  time_min?: number | null;
}

export interface MockDebriefData {
  varc: MockSectionData;
  dilr: MockSectionData;
  qa: MockSectionData;
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

const SECTIONS = [
  { key: 'varc' as const, label: 'VARC' },
  { key: 'dilr' as const, label: 'DILR' },
  { key: 'qa' as const, label: 'QA' },
];

type SectionKey = 'varc' | 'dilr' | 'qa';
type SectionData = MockSectionData;

const defaultSection = (): SectionData => ({ percentile: null });

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

/** Downscale to max 1568px long edge and re-encode as JPEG so uploads stay
 *  small. One canonical implementation (lib/image-downscale) — this was the
 *  third hand-rolled copy of the same canvas recipe (Incident #23 pattern). */
async function fileToBase64Jpeg(file: File): Promise<{ data: string; mediaType: string }> {
  const out = await prepareImage(file, { maxDim: 1568, quality: 0.85, maxBytes: 8 * 1024 * 1024 });
  if ('tooLarge' in out) throw new Error('Image too large');
  return { data: out.data, mediaType: out.mime };
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
      // Each scan = this scorecard only. Never inherit fields from a previous scan.
      // Fields Gemini returns as null were not present on this image — show blank.
      setOverallPercentile(sc.overall_percentile ?? null);
      setSections(() => {
        const fresh = { varc: defaultSection(), dilr: defaultSection(), qa: defaultSection() };
        for (const key of ['varc', 'dilr', 'qa'] as const) {
          const s = sc[key];
          if (!s) continue;
          // FIXED 22 Aug. This line used to be `{ percentile: s.percentile }`
          // — it read attempted, correct and time_min out of the parsed
          // scorecard and dropped them on the floor. Gemini extracts all
          // fifteen fields, the server's DebriefRequest has always accepted
          // them, and the jsonb column has always held them; the client threw
          // eleven of fifteen away on every mock a student ever scanned.
          //
          // The 23 Jul simplification was right about MANUAL entry — nobody
          // fills a five-bucket form after a three-hour paper. But it was
          // applied to the MACHINE-READ path too, where the student does
          // nothing. Sectional accuracy and time allocation are exactly what
          // separates a 60th-percentile mock from an 85th, and we were paying
          // to read them and then deleting them.
          fresh[key] = {
            percentile: s.percentile ?? null,
            attempted: s.attempted ?? null,
            correct: s.correct ?? null,
            time_min: s.time_min ?? null,
          };
        }
        return fresh;
      });
      setScanResult(
        (sc.mock_name ? `Read ${sc.mock_name} ✓` : 'Scorecard read ✓') +
        ' — blank fields weren\'t on this image, fill if needed'
      );
    } catch (e) {
      console.error('scorecard scan error', e);
      setScanError('Could not read the image — fill in manually.');
    } finally {
      setScanning(false);
    }
  };

  const handleSectionPercentile = (key: SectionKey, val: number | null) => {
    setSections((prev) => ({ ...prev, [key]: { percentile: val } }));
  };

  const handleSubmit = async () => {
    try {
      setError(null);
      await onSubmit({
        varc: sections.varc,
        dilr: sections.dilr,
        qa: sections.qa,
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

          {/* Section-wise percentile */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-3">
              Section-wise percentile
            </label>
            <div className="grid grid-cols-3 gap-2">
              {SECTIONS.map(({ key, label }) => (
                <div key={key}>
                  <label className="block text-[10px] font-bold uppercase tracking-wide text-zinc-500 mb-1">{label}</label>
                  <input
                    type="number"
                    inputMode="numeric"
                    value={sections[key].percentile ?? ''}
                    onChange={(e) => handleSectionPercentile(key, e.target.value === '' ? null : Number(e.target.value))}
                    min={0}
                    max={100}
                    placeholder="—"
                    className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-3 py-2.5 text-sm font-bold text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-500"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Important observation */}
          <div>
            <label className="block text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-2">
              Important observation
            </label>
            <textarea
              value={strategyNote}
              onChange={(e) => setStrategyNote(e.target.value)}
              placeholder="Anything important you noticed..."
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
            {isSubmitting ? 'Saving…' : 'Save Debrief'}
          </button>
        </div>
      </div>
    </div>
  );
}
