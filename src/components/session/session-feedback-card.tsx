'use client';
import { useState } from 'react';
import { RESOLUTIONS, RESOLUTION_LABEL, MIN_RATING, MAX_RATING,
  type Resolution } from '@/lib/session-feedback';

// ── "How was your session?" ─────────────────────────────────────────────────
//
// Shown only after a session actually reached `completed` — the database
// refuses feedback on anything else, so this can never become a rating for a
// call that did not happen.
//
// THREE SEPARATE QUESTIONS, on purpose. A student can like their mentor and
// still leave with the problem unsolved; collapsing that into one star rating
// hides the only case worth acting on. Rating measures the person, resolution
// measures the outcome, and they are allowed to disagree.
//
// Short by design. A long form after a call is a form nobody fills.

export function SessionFeedbackCard({ videoSessionId, buddyName, onDone }: {
  videoSessionId: string;
  buddyName?: string | null;
  onDone?: () => void;
}) {
  const [rating, setRating] = useState<number | null>(null);
  const [resolved, setResolved] = useState<Resolution | null>(null);
  const [again, setAgain] = useState<boolean | null>(null);
  const [helped, setHelped] = useState('');
  const [missing, setMissing] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = rating != null && resolved != null;

  async function submit() {
    if (!ready) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch('/api/sessions/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          videoSessionId, rating, issueResolved: resolved,
          wouldBookAgain: again, whatHelped: helped, whatWasMissing: missing,
        }),
      });
      const json = await res.json().catch(() => null);
      // Confirmed only when the server says so — never optimistically.
      if (res.ok && json?.ok === true) { setDone(true); onDone?.(); }
      else setError(json?.error ?? 'Could not save that — try again.');
    } catch {
      setError('Connection issue — try again.');
    } finally { setSaving(false); }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-center">
        <p className="text-sm font-bold text-emerald-800">Thank you — that helps us a lot.</p>
        <p className="mt-0.5 text-[11px] text-emerald-700">
          What you said goes to the team, not just your buddy.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4">
      <p className="text-[13px] font-bold text-stone-900">
        How was your session{buddyName ? ` with ${buddyName}` : ''}?
      </p>

      <div>
        <p className="text-[11px] font-semibold text-stone-500">Your rating</p>
        <div className="mt-1 flex gap-1.5">
          {Array.from({ length: MAX_RATING - MIN_RATING + 1 }, (_, i) => i + MIN_RATING).map((n) => (
            <button
              key={n} type="button" aria-label={`${n} star${n > 1 ? 's' : ''}`}
              aria-pressed={rating === n}
              onClick={() => setRating(n)}
              className={`h-10 w-10 rounded-lg text-[15px] font-bold ${
                rating != null && n <= rating
                  ? 'bg-amber-400 text-white' : 'border border-stone-200 bg-white text-stone-400'
              }`}
            >{n}</button>
          ))}
        </div>
      </div>

      {/* Deliberately separate from the rating. */}
      <div>
        <p className="text-[11px] font-semibold text-stone-500">
          Did it solve what you booked it for?
        </p>
        <div className="mt-1 flex flex-wrap gap-1.5">
          {RESOLUTIONS.map((r) => (
            <button
              key={r} type="button" aria-pressed={resolved === r}
              onClick={() => setResolved(r)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                resolved === r ? 'bg-teal-700 text-white' : 'border border-stone-200 bg-white text-stone-600'
              }`}
            >{RESOLUTION_LABEL[r]}</button>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[11px] font-semibold text-stone-500">Would you book another?</p>
        <div className="mt-1 flex gap-1.5">
          {[['Yes', true], ['Not now', false]].map(([label, v]) => (
            <button
              key={String(label)} type="button" aria-pressed={again === v}
              onClick={() => setAgain(v as boolean)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold ${
                again === v ? 'bg-stone-900 text-white' : 'border border-stone-200 bg-white text-stone-600'
              }`}
            >{label as string}</button>
          ))}
        </div>
      </div>

      <textarea value={helped} onChange={(e) => setHelped(e.target.value)} rows={2} maxLength={2000}
        placeholder="What helped most? (optional)"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />
      <textarea value={missing} onChange={(e) => setMissing(e.target.value)} rows={2} maxLength={2000}
        placeholder="What was missing? (optional)"
        className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm" />

      {error && <p className="text-[12px] font-semibold text-rose-600">{error}</p>}

      <button onClick={submit} disabled={!ready || saving}
        className="w-full rounded-xl bg-stone-900 py-2.5 text-sm font-bold text-white active:scale-[0.98] disabled:opacity-50">
        {saving ? 'Sending…' : 'Send feedback'}
      </button>
      {!ready && (
        <p className="text-center text-[11px] text-stone-400">
          A rating and one answer above — that&apos;s all.
        </p>
      )}
    </div>
  );
}
