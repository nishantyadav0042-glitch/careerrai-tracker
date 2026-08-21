'use client';

import { useEffect, useRef, useState } from 'react';
import { X, HeartHandshake, Camera, Crop as CropIcon } from 'lucide-react';
import ReactCrop, { type PercentCrop } from 'react-image-crop';
import 'react-image-crop/dist/ReactCrop.css';
import { track } from '@/lib/journey';
import { MAX_IMAGE_BYTES, MAX_QUESTION_CHARS } from '@/lib/community-pipeline';
import { prepareImage } from '@/lib/image-downscale';

// "Stuck on something? Share it." — exactly two inputs, minimum friction:
// text, a photo, or both. No formatting, no titles, no classification — a
// photo is a question, and the safety screen that already reads every
// submission decides tip-vs-question and the section behind the scenes. It
// goes to the voting pool under a random name — anonymous by design, because
// the goal is helping students, not making anyone a star.
//
// PROGRESSIVE FRICTION (hardening sprint, 21 Aug): a good photo costs zero
// extra taps — preview and Send. Crop exists but is never mandatory: it is
// offered as a quiet "Crop" action on the preview, and it is ONLY pushed at
// the student when the server says the photo is several unrelated things
// (the "3rd Question." incident — a page of four questions with no way to
// point at one). The primitive is ONE COHERENT LEARNING OBJECT: a DI set or
// a passage with sub-questions sails through untouched.

// Photo preparation targets. 1600px long edge at q0.80 lands a textbook
// photo around 150–300 KB — WhatsApp territory, the size every Indian
// student's thumb is already calibrated to. (Community was the one path
// still at 2000px while the other two canvas paths used 1568.)
const PHOTO_MAX_DIM = 1600;
const PHOTO_QUALITY = 0.8;

// journey.ts guards this call the same way — an older in-app webview without
// crypto.randomUUID must degrade to a random string, not white-screen the
// share sheet during render (that throw would hit the error boundary).
function safeUuid(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch { /* fall through */ }
  return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

interface Img { data: string; mime: string; preview: string }

export function CommunitySubmit({ onClose }: { onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  // The funnel's missing rung (20 Aug forensic): we could not tell how many
  // students ever OPENED this sheet. Now we can.
  useEffect(() => { track('community_share_opened', {}); }, []);
  // ONE id per share intent, reused by every retry (21 Aug). The server keys
  // idempotency off it, so pressing Send twice can never create two shares.
  const requestId = useRef<string>(safeUuid());
  // The ORIGINAL file survives so a crop re-encodes from full resolution —
  // cropping the already-downscaled preview would throw away the legibility
  // the crop exists to buy.
  const originalFile = useRef<File | null>(null);
  const [questionText, setQuestionText] = useState('');
  const [image, setImage] = useState<Img | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  // Crop mode — entered by the student's choice, or suggested by the server.
  const [cropping, setCropping] = useState(false);
  const [crop, setCrop] = useState<PercentCrop>();

  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    setCropping(false);
    setCrop(undefined);
    try {
      const out = await prepareImage(file, { maxDim: PHOTO_MAX_DIM, quality: PHOTO_QUALITY, maxBytes: MAX_IMAGE_BYTES });
      if ('tooLarge' in out) { setError('That photo is too large even after compressing — try a closer crop'); return; }
      originalFile.current = file;
      setImage({ data: out.data, mime: out.mime, preview: out.preview });
    } catch {
      setError('Couldn’t read that photo — use a JPG/PNG, or just type the question below');
    }
  }

  /** Apply the dragged crop to the ORIGINAL photo at full resolution. */
  async function applyCrop() {
    const file = originalFile.current;
    const c = crop;
    if (!file || !c || c.width < 5 || c.height < 5) { setCropping(false); return; }
    try {
      const out = await prepareImage(file, {
        maxDim: PHOTO_MAX_DIM, quality: PHOTO_QUALITY, maxBytes: MAX_IMAGE_BYTES,
        crop: { x: c.x / 100, y: c.y / 100, width: c.width / 100, height: c.height / 100 },
      });
      if ('tooLarge' in out) { setError('That crop is still too large — try a tighter one'); return; }
      setImage({ data: out.data, mime: out.mime, preview: out.preview });
      setCropping(false);
      setCrop(undefined);
      setError(null);
    } catch {
      setError('Couldn’t crop that photo — retake it instead');
      setCropping(false);
    }
  }

  // The only requirement is that they said something. Everything else —
  // question or tip, which section, which topic — is worked out behind the
  // screen from the content itself.
  const ready = image != null || questionText.trim().length >= 10;

  /** Did this share actually land? null = we could not find out. */
  async function reconcile(): Promise<string | null> {
    try {
      const res = await fetch(`/api/community/submit?requestId=${encodeURIComponent(requestId.current)}`);
      if (!res.ok) return null;
      const json = await res.json();
      return json.found ? (json.message as string) : null;
    } catch { return null; }
  }

  async function submit() {
    setBusy(true); setError(null);
    // The student pressed Send. Everything after this is OUR problem, and any
    // outcome other than a submission is a defect until proven otherwise.
    track('community_share_attempted', { mode: image && questionText.trim() ? 'both' : image ? 'image' : 'text' });
    try {
      const body = {
        requestId: requestId.current,
        text: questionText.trim() || undefined,
        ...(image ? { image: image.data, image_mime: image.mime } : {}),
      };
      const res = await fetch('/api/community/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        // The CODE is the point (19 Aug: a bare status:400 left us unable to
        // say why a real student's attempt died).
        track('community_share_blocked', { status: res.status, code: json.code ?? 'UNKNOWN' });
        setError(json.error ?? 'Could not send.');
        // Progressive friction: the server names the help this photo needs.
        // Several unrelated questions → open the crop so one tap of guidance
        // becomes one drag of a box, not a typed "3rd Question."
        if (json.code === 'IMAGE_MULTIPLE_OBJECTS' && image) setCropping(true);
        setBusy(false);
        return;
      }
      // The server decides kind/section AND the honest sentence: a published
      // share and one held for checking are different truths, told apart.
      track('community_submitted', {
        mode: image && questionText.trim() ? 'both' : image ? 'image' : 'text',
        published: json.published === true,
      });
      setSent(json.message as string);
    } catch (e) {
      // The request died before it produced an answer — which does NOT mean
      // the share failed. On 21 Aug the server finished successfully FIFTEEN
      // SECONDS after the phone gave up, and the student was told it failed.
      // We do not know, so we do not claim: ask the server what actually
      // happened, keyed by this intent's id.
      track('community_share_failed', { reason: e instanceof Error ? e.name : 'unknown' });
      setChecking(true);
      const landed = await reconcile();
      setChecking(false);
      if (landed) {
        track('community_submitted', { mode: image && questionText.trim() ? 'both' : image ? 'image' : 'text', via: 'reconcile' });
        setSent(landed);
      } else {
        // Still unknown, or genuinely absent. Retrying is safe — same id.
        setError('We couldn’t confirm it yet. Tap Send again — it won’t post twice.');
      }
    }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      {/* Sheet = header + scrolling body + PINNED footer. The send button must
          be visible whether you scroll or not (founder, 26 Jul) — a CTA that
          hides below a photo preview is a CTA that doesn't exist. */}
      <div className="flex max-h-[92vh] w-full max-w-md flex-col rounded-t-2xl bg-white sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2 px-5 pt-5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500">
            <HeartHandshake className="h-5 w-5 text-white" />
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-stone-400">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-3">

        {sent ? (
          <>
            <p className="mt-3 text-[16px] font-bold text-stone-900">Sent 🙌</p>
            <p className="mt-1.5 text-[13px] leading-relaxed text-stone-600">{sent}</p>
            <button type="button" onClick={onClose} className="mt-4 w-full rounded-xl bg-stone-900 py-3 text-[14px] font-bold text-white">
              Done
            </button>
          </>
        ) : (
          <>
            {/* ONE screen, no form (founder, 20 Aug). No tip/question toggle,
                no Section dropdown, no Topic dropdown — classification happens
                behind the screen, where it costs the student nothing. */}
            <p className="mt-3 text-[16px] font-bold text-stone-900">Stuck on something? Share it.</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
              Send it to other students — photo or text, whatever is easier. Nobody sees your name.
            </p>

            <div className="mt-3 space-y-2">
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value.slice(0, MAX_QUESTION_CHARS))}
                rows={3}
                placeholder="Type it… the question that beat you, or a doubt. Or just add a photo."
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[14px] text-stone-900"
              />
              <input
                ref={fileInput}
                type="file" accept="image/*" capture="environment"
                className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
              />
              {image && cropping ? (
                <>
                  <p className="text-[12px] font-semibold text-stone-600">Drag a box around just the question you mean.</p>
                  <div className="max-h-72 overflow-hidden rounded-xl border border-stone-200" style={{ touchAction: 'none' }}>
                    <ReactCrop crop={crop} onChange={(_, pct) => setCrop(pct)}>
                      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL */}
                      <img src={image.preview} alt="Choose the question" className="max-h-72 w-full object-contain" />
                    </ReactCrop>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button" onClick={() => { setCropping(false); setCrop(undefined); }}
                      className="flex-1 rounded-lg bg-stone-100 py-2 text-[12px] font-bold text-stone-700"
                    >
                      Cancel
                    </button>
                    <button
                      type="button" onClick={() => void applyCrop()}
                      disabled={!crop || crop.width < 5}
                      className="flex-1 rounded-lg bg-stone-900 py-2 text-[12px] font-bold text-white disabled:opacity-40"
                    >
                      Use this part
                    </button>
                  </div>
                </>
              ) : image ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                  <img src={image.preview} alt="What you are sharing" className="max-h-56 w-full rounded-xl border border-stone-200 object-contain" />
                  <div className="mt-1.5 flex gap-2">
                    <button
                      type="button" onClick={() => fileInput.current?.click()}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-stone-100 py-2 text-[12px] font-bold text-stone-700 active:scale-[0.98]"
                    >
                      <Camera className="h-3.5 w-3.5" /> Retake
                    </button>
                    <button
                      type="button" onClick={() => setCropping(true)}
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-stone-100 py-2 text-[12px] font-bold text-stone-700 active:scale-[0.98]"
                    >
                      <CropIcon className="h-3.5 w-3.5" /> Crop
                    </button>
                  </div>
                </>
              ) : (
                <button
                  type="button" onClick={() => fileInput.current?.click()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 py-3 text-[13px] font-semibold text-stone-600 active:scale-[0.99]"
                >
                  <Camera className="h-4 w-4" /> Add a photo
                </button>
              )}
            </div>

          </>
        )}
        </div>

        {/* Pinned footer — visible whether they scroll or not. */}
        {!sent && (
          <div className="border-t border-stone-100 px-5 pb-4 pt-3">
            {error && <p className="mb-2 text-[12px] text-rose-600">{error}</p>}
            <button
              type="button" disabled={busy || !ready || cropping} onClick={() => void submit()}
              className="w-full rounded-xl bg-orange-500 py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {checking ? 'Checking your submission…' : busy ? 'Checking & sending…' : 'Send to the community'}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-stone-400">
              One share a day · checked automatically before anyone sees it
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
