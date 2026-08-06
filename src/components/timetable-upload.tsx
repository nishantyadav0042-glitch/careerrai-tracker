'use client';

import { useRef, useState } from 'react';
import { CalendarClock, Loader2, Upload, X, Check, Trash2 } from 'lucide-react';
import { track } from '@/lib/journey';
import { whenLabel, timeLabel, type TimetableBlock, type TimetableKind, type CoachingTarget } from '@/lib/timetable';

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

type Stage = 'ask' | 'reading' | 'review' | 'choose' | 'saving' | 'hours';

export type CloseReason = 'saved' | 'declined' | 'closed';

export function TimetableUpload({ onClose, kind = 'weekly' }: {
  onClose: (reason: CloseReason) => void;
  kind?: TimetableKind;
}) {
  const [stage, setStage] = useState<Stage>('ask');
  const [blocks, setBlocks] = useState<TimetableBlock[]>([]);
  const [targets, setTargets] = useState<CoachingTarget[]>([]);
  const [syllabusEndDate, setSyllabusEndDate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  // Set when the saved timetable plans materially different daily hours than
  // the student's own setting. The founder's rule: we CHECK, the student
  // decides — one tap adopts the timetable's number through the one writer.
  const [hoursMismatch, setHoursMismatch] = useState<{ timetableHours: number; currentHours: number } | null>(null);
  const [hoursBusy, setHoursBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const dismiss = (reason: CloseReason) => {
    track('timetable_dismissed', { stage, reason });
    onClose(reason);
  };

  // WhatsApp downloads and some Android pickers hand over .xlsx with an empty
  // or generic MIME type, so the extension is the reliable signal, not the
  // browser's guess.
  function spreadsheetType(file: File): string | null {
    const name = file.name.toLowerCase();
    if (name.endsWith('.xlsx')) return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    if (name.endsWith('.xlsm')) return 'application/vnd.ms-excel.sheet.macroEnabled.12';
    if (name.endsWith('.csv')) return 'text/csv';
    if (name.endsWith('.xls')) return 'application/vnd.ms-excel'; // server answers with the save-as-xlsx message
    return null;
  }

  // The server's rejection reasons are now file-specific ("save as .xlsx",
  // "password-protected") — "try a clearer photo" is wrong advice for those,
  // so the real message is kept and shown.
  const lastServerError = useRef<string | null>(null);

  async function parseOne(file: File): Promise<{ blocks: TimetableBlock[]; targets: CoachingTarget[]; end: string | null } | null> {
    const sheetType = spreadsheetType(file);
    const payload = sheetType
      ? { file: await fileToBase64(file), mediaType: sheetType }
      : file.type === 'application/pdf'
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
      if (typeof json?.error === 'string') lastServerError.current = json.error;
      return null;
    }
    return {
      blocks: (json.blocks as TimetableBlock[]) ?? [],
      targets: (json.targets as CoachingTarget[]) ?? [],
      end: (json.syllabusEndDate as string | null) ?? null,
    };
  }

  // A weekly sheet rarely fits in one photo — students shoot it in halves, or
  // send several days as separate images. Each is parsed on its own and the
  // results merged, so "two photos of one timetable" is one plan, not two.
  async function handleFiles(files: File[]) {
    setError(null);
    setStage('reading');
    track('timetable_upload_start', { count: files.length, kb: Math.round(files.reduce((n, f) => n + f.size, 0) / 1024) });

    const allBlocks: TimetableBlock[] = [];
    const allTargets: CoachingTarget[] = [];
    let endDate: string | null = null;
    let failures = 0;

    for (let i = 0; i < files.length; i++) {
      setProgress(files.length > 1 ? `Reading ${i + 1} of ${files.length}…` : null);
      try {
        const r = await parseOne(files[i]);
        if (!r) { failures++; continue; }
        allBlocks.push(...r.blocks);
        allTargets.push(...r.targets);
        endDate ??= r.end;
      } catch {
        failures++;
      }
    }
    setProgress(null);

    if (allBlocks.length === 0 && allTargets.length === 0) {
      setError(lastServerError.current
        ?? (files.length > 1
          ? "Couldn't read any of those. Try clearer photos."
          : "Couldn't read that. Try a clearer photo."));
      lastServerError.current = null;
      setStage('ask');
      return;
    }

    // Merge. The same class photographed twice must not become two classes.
    const seenBlock = new Set<string>();
    const mergedBlocks = allBlocks.filter((b) => {
      const k = `${b.date ?? b.dayIndex ?? b.day}|${b.start ?? 'all'}|${b.label.toLowerCase()}`;
      if (seenBlock.has(k)) return false;
      seenBlock.add(k);
      return true;
    });
    // One target per kind+section, keeping the LARGEST count — a sheet that
    // repeats "100-150 topic tests" across two photos states one target.
    const byKey = new Map<string, CoachingTarget>();
    for (const t of allTargets) {
      const k = `${t.kind}:${t.section ?? 'any'}`;
      const prev = byKey.get(k);
      if (!prev || (t.count ?? 0) > (prev.count ?? 0)) byKey.set(k, t);
    }

    setBlocks(mergedBlocks);
    setTargets([...byKey.values()]);
    setSyllabusEndDate(endDate);
    if (failures > 0) setError(`${failures} of ${files.length} couldn't be read — check the list below.`);
    setStage('review');
  }

  async function save(followCoaching: boolean) {
    setStage('saving');
    setError(null);
    try {
      const res = await fetch('/api/timetable', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ blocks, targets, kind, syllabusEndDate, followCoaching }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not save. Please try again.');
        setStage('choose');
        return;
      }
      track('timetable_saved', {
        blocks: blocks.length, targets: targets.length,
        alignedTopics: json.alignedTopics ?? 0, planSource: json.planSource, kind,
        planRebuilt: json.planRebuilt ?? false,
      });
      if (json.hoursMismatch) {
        // Saved fine — but the timetable plans different hours than the
        // student's setting. Ask before closing; skipping keeps their number.
        setHoursMismatch(json.hoursMismatch as { timetableHours: number; currentHours: number });
        setStage('hours');
        return;
      }
      onClose('saved');
    } catch {
      setError('Could not save. Please try again.');
      setStage('choose');
    }
  }

  async function adoptTimetableHours() {
    if (!hoursMismatch) return;
    setHoursBusy(true);
    try {
      await fetch('/api/student/daily-hours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours: hoursMismatch.timetableHours }),
      });
    } catch { /* their old number stands; the card on Home will re-offer */ }
    onClose('saved');
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
              <button type="button" onClick={() => dismiss('closed')} aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full text-stone-400 hover:bg-stone-100">
                <X className="h-4 w-4" />
              </button>
            </div>

            <h2 className="mt-4 text-xl font-bold text-stone-900">Add your class timetable</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">
              Upload the Excel file your coaching sent, or just a photo of it. Then when your class teaches
              Percentages, your plan here says Percentages too — instead of sending you somewhere else.
            </p>
            <p className="mt-2 text-[13px] text-stone-500">
              Excel (.xlsx), PDF and photos all work — daily and weekly sheets both get read. Pick more than one
              file if you need to.
            </p>

            {error && (
              <p className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">{error}</p>
            )}

            <input
              ref={inputRef} type="file"
              accept="image/*,application/pdf,.xlsx,.xlsm,.xls,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,text/csv"
              multiple className="hidden"
              onChange={(e) => {
                const fs = Array.from(e.target.files ?? []).slice(0, 8);
                if (fs.length) void handleFiles(fs);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              disabled={stage === 'reading'}
              onClick={() => inputRef.current?.click()}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {stage === 'reading'
                ? (<><Loader2 className="h-4 w-4 animate-spin" /> {progress ?? 'Reading your plan…'}</>)
                : (<><Upload className="h-4 w-4" /> Choose file or photos</>)}
            </button>

            <button type="button" onClick={() => dismiss('declined')}
              className="mt-2 w-full py-2.5 text-center text-sm font-medium text-stone-500">
              I don&apos;t have one
            </button>
          </>
        )}

        {stage === 'review' && (
          <>
            <h2 className="text-xl font-bold text-stone-900">Is this right?</h2>
            <p className="mt-1 text-sm text-stone-600">
              {blocks.length > 0 && <>{blocks.length} {blocks.length === 1 ? 'class' : 'classes'}</>}
              {blocks.length > 0 && targets.length > 0 && ' · '}
              {targets.length > 0 && <>{targets.length} {targets.length === 1 ? 'target' : 'targets'}</>}
              {mapped > 0 && <> · {mapped} matched to CareerRai topics</>}. Remove anything wrong.
            </p>

            {targets.length > 0 && (
              <div className="mt-4">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-widest text-stone-400">
                  What your coaching expects
                </p>
                <div className="space-y-1.5">
                  {targets.map((t, i) => (
                    <div key={`t-${i}`} className="flex items-center gap-3 rounded-xl bg-orange-50 px-3 py-2.5">
                      {t.count != null && (
                        <span className="w-10 shrink-0 text-sm font-bold tabular-nums text-orange-700">{t.count}</span>
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm text-stone-800">{t.label}</span>
                      {t.section && (
                        <span className="shrink-0 rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-stone-600">
                          {t.section}
                        </span>
                      )}
                      <button
                        type="button" aria-label="Remove this target"
                        onClick={() => setTargets((p) => p.filter((_, j) => j !== i))}
                        className="shrink-0 text-stone-400 hover:text-rose-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-4 space-y-1.5">
              {blocks.map((b, i) => (
                <div key={`${b.date ?? b.dayIndex ?? b.day}-${b.start ?? "all"}-${i}`} className="flex items-center gap-3 rounded-xl bg-stone-50 px-3 py-2.5">
                  <span className="w-12 shrink-0 text-xs font-bold text-stone-500">{whenLabel(b)}</span>
                  <span className="w-24 shrink-0 text-xs tabular-nums text-stone-600">{timeLabel(b)}</span>
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

            {blocks.length === 0 && targets.length === 0 && (
              <p className="mt-4 rounded-xl bg-stone-50 px-3 py-3 text-center text-sm text-stone-500">
                Nothing left — upload a different photo, or skip for now.
              </p>
            )}

            {error && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}

            <button
              type="button" onClick={() => setStage('choose')} disabled={blocks.length === 0 && targets.length === 0}
              className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl bg-orange-500 py-4 text-sm font-bold text-white disabled:bg-stone-200 disabled:text-stone-400"
            >
              <Check className="h-4 w-4" /> Looks right
            </button>
            <button type="button" onClick={() => { setStage('ask'); setBlocks([]); setTargets([]); }}
              className="mt-2 w-full py-2.5 text-center text-sm font-medium text-stone-500">
              Upload a different photo
            </button>
          </>
        )}

        {stage === 'hours' && hoursMismatch && (
          <>
            <h2 className="text-xl font-bold text-stone-900">One number to settle</h2>
            <p className="mt-2 text-[15px] leading-relaxed text-stone-600">
              Your timetable plans about <strong>{hoursMismatch.timetableHours}h a day</strong>. Your daily hours here
              are set to <strong>{hoursMismatch.currentHours}h</strong> — so your plan and your timetable would ask
              different things of the same day.
            </p>
            <button
              type="button" disabled={hoursBusy} onClick={() => void adoptTimetableHours()}
              className="mt-5 w-full rounded-2xl bg-stone-900 py-4 text-sm font-semibold text-white disabled:opacity-60"
            >
              {hoursBusy ? 'Saving…' : `Match my timetable — ${hoursMismatch.timetableHours}h a day`}
            </button>
            <button type="button" disabled={hoursBusy} onClick={() => onClose('saved')}
              className="mt-2 w-full py-2.5 text-center text-sm font-medium text-stone-500">
              Keep my {hoursMismatch.currentHours}h
            </button>
          </>
        )}

        {(stage === 'choose' || stage === 'saving') && (
          <>
            <h2 className="text-xl font-bold text-stone-900">Follow this timetable?</h2>
            <p className="mt-1.5 text-[15px] leading-relaxed text-stone-600">
              {blocks.length > 0
                ? <>You&apos;ve got {blocks.length} {blocks.length === 1 ? 'class' : 'classes'} a week. </>
                : <>We&apos;ve got your coaching&apos;s targets. </>}
              Do you want us to follow your coaching, or build your own order?
            </p>

            {error && (
              <p className="mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</p>
            )}

            <button
              type="button" disabled={stage === 'saving'} onClick={() => save(true)}
              className="mt-5 w-full rounded-2xl border-2 border-orange-500 bg-orange-50 p-4 text-left disabled:opacity-60"
            >
              <p className="text-sm font-bold text-stone-900">Yes, match my class</p>
              <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
                We&apos;ll push the same topics your class is teaching, so what you study here backs up what you just
                learnt there.
                {syllabusEndDate && (
                  <> We&apos;ll also aim to finish the syllabus by{' '}
                    <span className="font-semibold text-stone-800">
                      {new Date(`${syllabusEndDate}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>, the date on your sheet.
                  </>
                )}
              </p>
            </button>

            <button
              type="button" disabled={stage === 'saving'} onClick={() => save(false)}
              className="mt-2.5 w-full rounded-2xl border border-stone-200 bg-white p-4 text-left disabled:opacity-60"
            >
              <p className="text-sm font-bold text-stone-900">No, plan it for me</p>
              <p className="mt-1 text-[13px] leading-relaxed text-stone-600">
                We&apos;ll choose your topics by what scores most for you. Your class times stay saved either way.
              </p>
            </button>

            {stage === 'saving' && (
              <p className="mt-4 flex items-center justify-center gap-2 text-sm text-stone-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Setting up your plan…
              </p>
            )}

            <button type="button" disabled={stage === 'saving'} onClick={() => setStage('review')}
              className="mt-2 w-full py-2.5 text-center text-sm font-medium text-stone-500 disabled:opacity-60">
              Back
            </button>
          </>
        )}
      </div>
    </div>
  );
}
