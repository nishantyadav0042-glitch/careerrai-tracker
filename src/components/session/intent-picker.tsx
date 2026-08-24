'use client';
import { SESSION_INTENTS, INTENT_LABEL, intentNeedsNote, MIN_NOTE_LENGTH,
  type SessionIntent } from '@/lib/session-intent';

// ── "What would you like help with?" ────────────────────────────────────────
//
// Asked BEFORE the money, for two reasons. The mentor opens the call already
// knowing the problem instead of spending the first ten minutes finding it —
// and the company can finally answer the question it has never been able to:
// what are students actually paying ₹299 to solve?
//
// Deliberately NOT a free-text box. Thirty-seven students typing the same
// problem in thirty-seven different sentences is an anecdote; thirty-seven
// rows carrying the same CATEGORY is a product decision. The optional note
// exists for everything the categories cannot hold.

export function IntentPicker({ value, note, onChange, disabled }: {
  value: SessionIntent | null;
  note: string;
  onChange: (v: { intent: SessionIntent | null; note: string }) => void;
  disabled?: boolean;
}) {
  const needsNote = intentNeedsNote(value);
  const noteTooShort = needsNote && note.trim().length < MIN_NOTE_LENGTH;

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-bold text-stone-900">What would you like help with?</p>
        <p className="text-[11px] text-stone-500">Your buddy sees this before the call.</p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SESSION_INTENTS.map((k) => (
          <button
            key={k}
            type="button"
            disabled={disabled}
            aria-pressed={value === k}
            onClick={() => onChange({ intent: k, note })}
            className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-50 ${
              value === k
                ? 'bg-teal-700 text-white'
                : 'border border-stone-200 bg-white text-stone-600'
            }`}
          >
            {INTENT_LABEL[k]}
          </button>
        ))}
      </div>

      {/* Required for "Something else" — that is the answer a student picks
          when none of ours fit, which makes it the one worth reading. */}
      <div>
        <label className="text-[11px] font-semibold text-stone-500">
          {needsNote
            ? 'Tell your buddy what you need (required)'
            : 'Anything specific you want them to know? (optional)'}
        </label>
        <textarea
          value={note}
          disabled={disabled}
          onChange={(e) => onChange({ intent: value, note: e.target.value })}
          rows={2}
          maxLength={500}
          placeholder="e.g. My coaching moved to mornings and my plan no longer fits."
          className={`mt-1 w-full rounded-lg border bg-white px-3 py-2 text-sm disabled:opacity-50 ${
            noteTooShort ? 'border-amber-400' : 'border-stone-300'
          }`}
        />
        {noteTooShort && (
          <p className="mt-0.5 text-[11px] font-semibold text-amber-700">
            A few words is enough — but &ldquo;Something else&rdquo; needs them.
          </p>
        )}
      </div>
    </div>
  );
}

/** Whether the booking may proceed. Mirrors validateIntent on the server. */
export function intentIsComplete(value: SessionIntent | null, note: string): boolean {
  if (value == null) return false;
  if (intentNeedsNote(value)) return note.trim().length >= MIN_NOTE_LENGTH;
  return true;
}
