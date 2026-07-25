'use client';

import { useRef, useState } from 'react';
import { CalendarClock, Loader2, Upload, X, Check, Trash2 } from 'lucide-react';
import { track } from '@/lib/journey';
import { DAY_LABELS, formatTime, type TimetableBlock } from '@/lib/timetable';

// "Upload your coaching timetable" — offered in a student's first days.
//
// The parse is never applied blind. Gemini reads the photo, then the student
// sees exactly what it found and can delete any wrong row before saving. That
// confirmation step is what makes an imperfect read acceptable: a misread row
// becomes a one-tap fix instead of a corrupted study plan.

const MAX_EDGE = 1568;

async function imageToBase64Jpeg(file: File): Promise<{ data: string; mediaType: string }> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const h = Math.round(bitmap.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas not supported');
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  return { data: canvas.toDataURL('image/jpeg', 0.85).split(',')[1], mediaType: 'image/jpeg' };
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1]);
    reader.onerror = () => reject(new Error('read failed'));
    reader.readAsDataURL(file);
  });
}

type Stage = 'ask' | 'reading' | 'review' | 'saving';

export function TimetableUpload({ onClose }: { onClose: () => void }) {
  const [stage, setStage] = useState<Stage>('ask');
  const [blocks, setBlocks] = useState<TimetableBlock[]>([]);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const dismiss = (how: string) => {
    track('timetable_dismissed', { stage, how });
    onClose();
  };

  async function handleFile(file: File) {
    setError(null);
    setStage('reading');
    track('timetable_upload_start', { type: file.type, kb: Math.round(file.size / 1024) });
    try {
      const payload = file.type === 'application/pdf'
        ? { file: await fileToBase64(file), mediaType: 'application/pdf' }
        : await imageToBase64Jpeg(file).then((r) => ({ file: r.data, mediaType: r.mediaType }));

      const res = await fetch('/api/timetable/parse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        track('timetable_parse_failed', { status: res.status });
        setError(json.error ?? 'Could not read that. Try a clearer photo.');
        setStage('ask');
        return;
      }
      setBlocks(json.blocks as TimetableBlock[]);
      setStage('review');
    } catch {
      setError('Could not read that file. Try a photo instead.');
      setStage('ask');
    }
  }

  async function save() {
    setStage('saving');
    setError(null);
    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not save. Please try again.');
        setStage('review');
        return;
      }
      track('timetable_saved', { blocks: blocks.length, alignedTopics: json.alignedTopics ?? 0 });
      onClose();
    } catch {
      setError('Could not save. Please try again.');
      setStage('review');
    }
  }

  const mapped = blocks.filter((b) => b.topic).length;

  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-stone-900/60 backdrop-blur-sm sm:items-center">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-white p-6 shadow-2xl sm:rounded-3xl">

        {(stage === 'ask' || stage === 'reading') && (
          <>
            <div className="flex items-start justify-between">
              <span className="grid h-11 w-11 place-items-center rounded-2xl bg-orange-500">
                <CalendarClock className="h-6 w-6 text-white" />
              </span>
              <button type="button" onClick={() => dismiss('x')} aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <h2 className="mt-4 text-xl font-bold text-stone-900">Going to a coaching class?</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">
              Upload your coaching timetable and CareerRai will follow it — your plan will push the same topics your
              class is teaching, instead of pulling you somewhere else.
            </p>
            <p className="mt-2 text-[13px] text-stone-500">A photo of the printed sheet is fine. You do this once.</p>

            {error && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>
            )}

            <input
              ref={inputRef} type="file" accept="image/*,application/pdf" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); e.target.value = ''; }}
            />

            <button
              type="button"
              disabled={stage === 'reading'}
              onClick={() => inputRef.current?.click()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {stage === 'reading'
                ? (<><Loader2 className="h-4 w-4 animate-spin" /> Reading your timetable…</>)
                : (<><Upload className="h-4 w-4" /> Upload photo or PDF</>)}
            </button>

            <button type="button" onClick={() => dismiss('later')}
              className="mt-2 w-full py-2.5 text-center text-sm font-medium text-stone-500">
              I don&apos;t go to coaching
            </button>
          </>
        )}

        {(stage === 'review' || stage === 'saving') && (
          <>
            <h2 className="text-xl font-bold text-stone-900">Is this right?</h2>
            <p className="mt-1 text-sm text-stone-600">
              Found {blocks.length} {blocks.length === 1 ? 'class' : 'classes'}
              {mapped > 0 && <> · {mapped} matched to CareerRai topics</>}. Remove anything wrong.
            </p>

            <div className="mt-4 space-y-1.5">
              {blocks.map((b, i) => (
                <div key={`${b.day}-${b.start}-${i}`} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
                  <span className="w-9 shrink-0 text-xs font-bold text-stone-500">{DAY_LABELS[b.day]}</span>
                  <span className="w-24 shrink-0 text-xs tabular-nums text-stone-600">
                    {formatTime(b.start)}–{formatTime(b.end)}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold text-stone-900">
                    {b.topic ?? b.label}
                  </span>
                  {b.section && (
                    <span className="shrink-0 rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">
                      {b.section}
                    </span>
                  )}
                  <button
                    type="button" aria-label="Remove this class"
                    onClick={() => setBlocks((p) => p.filter((_, j) => j !== i))}
                    className="shrink-0 text-stone-400 hover:text-rose-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>

            {blocks.length === 0 && (
              <p className="mt-4 rounded-xl bg-stone-50 px-3 py-3 text-center text-sm text-stone-500">
                Nothing left — upload a different photo, or skip for now.
              </p>
            )}

            {error && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}

            <button
              type="button" onClick={save} disabled={blocks.length === 0 || stage === 'saving'}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white disabled:bg-stone-200 disabled:text-stone-400"
            >
              {stage === 'saving'
                ? (<><Loader2 className="h-4 w-4 animate-spin" /> Saving…</>)
                : (<><Check className="h-4 w-4" /> Looks right — follow this</>)}
            </button>
            <button type="button" onClick={() => { setStage('ask'); setBlocks([]); }}
              className="mt-2 w-full py-2.5 text-center text-sm font-medium text-stone-500">
              Upload a different photo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
