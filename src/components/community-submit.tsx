'use client';

import { useEffect, useRef, useState } from 'react';
import { X, HeartHandshake, Camera } from 'lucide-react';
import { track } from '@/lib/journey';
import { MAX_IMAGE_BYTES, MAX_QUESTION_CHARS } from '@/lib/community-pipeline';

// "Help the next student" — exactly two things, minimum friction:
//   💡 a Tip — one sharp idea in plain text (≤150 chars), section + topic
//   📷 a Question — TYPE it or PHOTOGRAPH it or both (founder, 20 Aug —
//      the mandatory image was the wall the one real attempt died on)
// No formatting, no links, no titles, no explanations. It goes to the voting
// pool under a random name — anonymous by design, because the goal is helping
// students, not making anyone a star. Students collectively decide what
// becomes featured curriculum.

export function CommunitySubmit({ onClose }: { onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  // The funnel's missing rung (20 Aug forensic): we could not tell how many
  // students ever OPENED this sheet. Now we can.
  useEffect(() => { track('community_share_opened', {}); }, []);
  const [questionText, setQuestionText] = useState('');
  const [image, setImage] = useState<{ data: string; mime: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  // Every photo is RE-ENCODED to JPEG through a canvas before upload. One
  // mechanism removes the two walls the forensic found: an iPhone HEIC (which
  // the server's JPG/PNG/WEBP list rejects with no useful guidance — the most
  // likely killer of the one real attempt, 19 Aug) decodes natively on iOS and
  // leaves here as JPEG; and an oversized photo is downscaled instead of
  // bounced. If the browser cannot decode the file at all, the student gets a
  // sentence that tells them what to do — never a dead end.
  async function onFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      const bitmap = await createImageBitmap(file);
      const MAX_DIM = 2000;
      const scale = Math.min(1, MAX_DIM / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const url = canvas.toDataURL('image/jpeg', 0.85);
      const b64 = url.split(',')[1] ?? '';
      // Base64 is ~4/3 of the byte size; stay under the server's cap.
      if (b64.length * 0.75 > MAX_IMAGE_BYTES) { setError('That photo is too large even after compressing — try a closer crop'); return; }
      setImage({ data: b64, mime: 'image/jpeg', preview: url });
    } catch {
      setError('Couldn’t read that photo — use a JPG/PNG, or just type the question below');
    }
  }

  // The only requirement is that they said something. Everything else —
  // question or tip, which section, which topic — is worked out behind the
  // screen from the content itself.
  const ready = image != null || questionText.trim().length >= 10;

  async function submit() {
    setBusy(true); setError(null);
    // The student pressed Send. Everything after this is OUR problem, and any
    // outcome other than a submission is a defect until proven otherwise.
    track('community_share_attempted', { mode: image && questionText.trim() ? 'both' : image ? 'image' : 'text' });
    try {
      const body = {
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
        setError(json.error ?? 'Could not send.'); setBusy(false); return;
      }
      // The server decides kind/section now, so the client reports only what
      // it actually knows: how the student chose to say it.
      track('community_submitted', {
        mode: image && questionText.trim() ? 'both' : image ? 'image' : 'text',
      });
      setSent(json.message as string);
    } catch (e) {
      // Previously silent: a network drop or a runtime throw set an error on
      // screen and left no trace, so an attempt that died here was
      // indistinguishable from a student who never pressed Send.
      track('community_share_failed', { reason: e instanceof Error ? e.name : 'unknown' });
      setError('Could not send. Please try again.');
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
            {/* ONE screen, no form (founder, 20 Aug). What used to stand here:
                a tip/question toggle, a Section dropdown and a Topic dropdown
                — three classification decisions asked BEFORE the student
                could say the thing they came to say. A student with a hard
                question in front of them should not have to file it first.
                All three now happen behind the screen: a photo is a question,
                and for text the safety screen that already reads every
                submission returns both the kind and the section. */}
            <p className="mt-3 text-[16px] font-bold text-stone-900">Stuck on something? Share it.</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
              Send it to other students — photo or text, whatever is easier. Nobody sees your name.
            </p>

            <div className="mt-3 space-y-2">
              <textarea
                value={questionText}
                onChange={(e) => setQuestionText(e.target.value.slice(0, MAX_QUESTION_CHARS))}
                rows={3}
                placeholder="Type it… a tough question, or a trick that worked. Or just add a photo."
                className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[14px] text-stone-900"
              />
              <input
                ref={fileInput}
                type="file" accept="image/*" capture="environment"
                className="hidden" onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }}
              />
              {image ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */}
                  <img src={image.preview} alt="What you are sharing" className="max-h-56 w-full rounded-xl border border-stone-200 object-contain" />
                  <button
                    type="button" onClick={() => fileInput.current?.click()}
                    className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded-lg bg-stone-100 py-2 text-[12px] font-bold text-stone-700 active:scale-[0.98]"
                  >
                    <Camera className="h-3.5 w-3.5" /> Retake photo
                  </button>
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
              type="button" disabled={busy || !ready} onClick={() => void submit()}
              className="w-full rounded-xl bg-orange-500 py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Checking & sending…' : 'Send to the community'}
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
