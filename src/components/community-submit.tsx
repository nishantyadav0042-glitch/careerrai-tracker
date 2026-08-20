'use client';

import { useEffect, useRef, useState } from 'react';
import { X, HeartHandshake, Camera } from 'lucide-react';
import { track } from '@/lib/journey';
import { TOPIC_METADATA, KNOWLEDGE_GRAPH } from '@/lib/topics-constants';
import { MAX_IMAGE_BYTES, IMAGE_MIMES, MAX_TIP_CHARS, MAX_QUESTION_CHARS } from '@/lib/community-pipeline';

// "Help the next student" — exactly two things, minimum friction:
//   💡 a Tip — one sharp idea in plain text (≤150 chars), section + topic
//   📷 a Question — TYPE it or PHOTOGRAPH it or both (founder, 20 Aug —
//      the mandatory image was the wall the one real attempt died on)
// No formatting, no links, no titles, no explanations. It goes to the voting
// pool under a random name — anonymous by design, because the goal is helping
// students, not making anyone a star. Students collectively decide what
// becomes featured curriculum.

const SECTIONS = KNOWLEDGE_GRAPH.map((s) => s.id);
const TOPICS_FOR = (sec: string) =>
  Object.entries(TOPIC_METADATA).filter(([, m]) => m.section === sec).map(([t]) => t).sort();

export function CommunitySubmit({ onClose }: { onClose: () => void }) {
  const fileInput = useRef<HTMLInputElement>(null);
  // The funnel's missing rung (20 Aug forensic): we could not tell how many
  // students ever OPENED this sheet. Now we can.
  useEffect(() => { track('community_share_opened', {}); }, []);
  const [kind, setKind] = useState<'tip' | 'question'>('tip');
  const [section, setSection] = useState('');
  const [topic, setTopic] = useState('');
  const [tip, setTip] = useState('');
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

  // Topic is optional for BOTH kinds now — the student brings the idea, the
  // system files it. Section stays because it is one tap and it is what the
  // feed is organised by.
  const ready = kind === 'tip'
    ? Boolean(section && tip.trim().length >= 15)
    : Boolean(section && (image != null || questionText.trim().length >= 10));

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = kind === 'tip'
        ? { kind, section, topic, tip: tip.trim() }
        : {
            kind, section, topic: topic || undefined,
            ...(questionText.trim() ? { text: questionText.trim() } : {}),
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
        track('community_share_blocked', { kind, section, status: res.status, code: json.code ?? 'UNKNOWN' });
        setError(json.error ?? 'Could not send.'); setBusy(false); return;
      }
      track('community_submitted', {
        kind, section,
        mode: kind === 'tip' ? 'text' : image && questionText.trim() ? 'both' : image ? 'image' : 'text',
      });
      setSent(json.message as string);
    } catch { setError('Could not send. Please try again.'); }
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
            <p className="mt-3 text-[16px] font-bold text-stone-900">Help the next student</p>
            <p className="mt-1 text-[12.5px] leading-relaxed text-stone-600">
              Solved a tough question today? Share it. A tip that worked? Share that too.
              Be part of the <span className="font-semibold text-stone-800">by-the-students,
              for-the-students</span> community — anonymous, and students vote on what gets featured.
            </p>

            <div className="mt-3 flex gap-1.5">
              <button
                type="button" onClick={() => setKind('tip')}
                className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold ${kind === 'tip' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
              >
                💡 A tip
              </button>
              <button
                type="button" onClick={() => setKind('question')}
                className={`flex-1 rounded-xl py-2.5 text-[13px] font-bold ${kind === 'question' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-600'}`}
              >
                📷 A question
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <select
                value={section} onChange={(e) => { setSection(e.target.value); setTopic(''); }}
                className="rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[14px] text-stone-900"
              >
                <option value="">Section…</option>
                {SECTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select
                value={topic} onChange={(e) => setTopic(e.target.value)} disabled={!section}
                className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-[14px] text-stone-900 disabled:opacity-50"
              >
                <option value="">Topic (optional)…</option>
                {section && TOPICS_FOR(section).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {kind === 'tip' ? (
              <label className="mt-3 block">
                <textarea
                  value={tip} onChange={(e) => setTip(e.target.value.slice(0, MAX_TIP_CHARS))} rows={3}
                  placeholder="One idea, simple words. e.g. Always mark the fixed positions first."
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[14px] text-stone-900"
                />
                <span className="mt-0.5 block text-right text-[10px] text-stone-400">{tip.length}/{MAX_TIP_CHARS}</span>
              </label>
            ) : (
              <div className="mt-3 space-y-2">
                <textarea
                  value={questionText}
                  onChange={(e) => setQuestionText(e.target.value.slice(0, MAX_QUESTION_CHARS))}
                  rows={3}
                  placeholder="Type the question… or just attach a photo below — either works"
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
                    <img src={image.preview} alt="Your question" className="max-h-56 w-full rounded-xl border border-stone-200 object-contain" />
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
                    className="flex h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border-2 border-dashed border-stone-300 text-stone-500"
                  >
                    <Camera className="h-5 w-5" />
                    <span className="text-[12.5px] font-semibold">Or take / upload a photo (optional)</span>
                  </button>
                )}
              </div>
            )}

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
