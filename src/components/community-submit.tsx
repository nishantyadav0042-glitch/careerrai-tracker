'use client';

import { useState } from 'react';
import { X, HeartHandshake, Camera } from 'lucide-react';
import { track } from '@/lib/journey';
import { TOPIC_METADATA, KNOWLEDGE_GRAPH } from '@/lib/topics-constants';

// "Help the next student" — exactly two things, minimum friction:
//   💡 a Tip — one sharp idea in plain text (≤150 chars), section + topic
//   📷 a Question — a photo, section only (the image IS the content)
// No formatting, no links, no titles, no explanations. It goes to the voting
// pool under a random name — anonymous by design, because the goal is helping
// students, not making anyone a star. Students collectively decide what
// becomes featured curriculum.

const SECTIONS = KNOWLEDGE_GRAPH.map((s) => s.id);
const TOPICS_FOR = (sec: string) =>
  Object.entries(TOPIC_METADATA).filter(([, m]) => m.section === sec).map(([t]) => t).sort();

export function CommunitySubmit({ onClose }: { onClose: () => void }) {
  const [kind, setKind] = useState<'tip' | 'question'>('tip');
  const [section, setSection] = useState('');
  const [topic, setTopic] = useState('');
  const [tip, setTip] = useState('');
  const [image, setImage] = useState<{ data: string; mime: string; preview: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  function onFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 4 * 1024 * 1024) { setError('Photo must be under 4 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      const b64 = url.split(',')[1] ?? '';
      setImage({ data: b64, mime: file.type, preview: url });
      setError(null);
    };
    reader.readAsDataURL(file);
  }

  const ready = kind === 'tip'
    ? section && topic && tip.trim().length >= 15
    : section && image != null;

  async function submit() {
    setBusy(true); setError(null);
    try {
      const body = kind === 'tip'
        ? { kind, section, topic, tip: tip.trim() }
        : { kind, section, topic: topic || undefined, image: image!.data, image_mime: image!.mime };
      const res = await fetch('/api/community/submit', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        track('community_share_blocked', { kind, section, status: res.status });
        setError(json.error ?? 'Could not send.'); setBusy(false); return;
      }
      track('community_submitted', { kind, section });
      setSent(json.message as string);
    } catch { setError('Could not send. Please try again.'); }
    setBusy(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-2">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-orange-500">
            <HeartHandshake className="h-5 w-5 text-white" />
          </span>
          <button type="button" onClick={onClose} aria-label="Close" className="text-stone-400">
            <X className="h-4 w-4" />
          </button>
        </div>

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
              Shared anonymously. Students vote — the best become tomorrow&apos;s featured
              pick for every CAT aspirant on CareerRai.
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
                <option value="">{kind === 'tip' ? 'Topic…' : 'Topic (optional)…'}</option>
                {section && TOPICS_FOR(section).map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>

            {kind === 'tip' ? (
              <label className="mt-3 block">
                <textarea
                  value={tip} onChange={(e) => setTip(e.target.value.slice(0, 150))} rows={3}
                  placeholder="One idea, simple words. e.g. Always mark the fixed positions first."
                  className="w-full rounded-xl border border-stone-200 px-3 py-2.5 text-[14px] text-stone-900"
                />
                <span className="mt-0.5 block text-right text-[10px] text-stone-400">{tip.length}/150</span>
              </label>
            ) : (
              <label className="mt-3 block cursor-pointer">
                <input
                  type="file" accept="image/jpeg,image/png,image/webp" capture="environment"
                  className="hidden" onChange={(e) => onFile(e.target.files?.[0])}
                />
                {image ? (
                  /* eslint-disable-next-line @next/next/no-img-element -- local data URL preview */
                  <img src={image.preview} alt="Your question" className="max-h-64 w-full rounded-xl border border-stone-200 object-contain" />
                ) : (
                  <span className="flex h-32 w-full flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-stone-300 text-stone-500">
                    <Camera className="h-6 w-6" />
                    <span className="text-[13px] font-semibold">Take a photo of the question</span>
                  </span>
                )}
              </label>
            )}

            {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

            <button
              type="button" disabled={busy || !ready} onClick={() => void submit()}
              className="mt-3 w-full rounded-xl bg-orange-500 py-3 text-[14px] font-bold text-white disabled:opacity-50"
            >
              {busy ? 'Checking & sending…' : 'Send to the community'}
            </button>
            <p className="mt-1.5 text-center text-[10px] text-stone-400">
              One share a day · checked automatically before anyone sees it
            </p>
          </>
        )}
      </div>
    </div>
  );
}
