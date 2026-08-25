'use client';
import { SESSION_INTENTS, INTENT_LABEL, intentNeedsNote, MIN_NOTE_LENGTH,
  MAX_INTENTS, type SessionIntent } from '@/lib/session-intent';

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
//
// MULTI-SELECT, up to MAX_INTENTS (founder, 25 Aug 2026). A ₹299 buyer rarely
// has exactly one problem — "QA is weak AND my routine collapsed" is the
// normal case, and a single-choice picker threw away the second half of it.
//
// ORDER IS MEANING, and the UI says so. The FIRST pick is the primary: it is
// what mentor matching reads, so the student decides which of their problems
// chooses the buddy rather than an arbitrary sort deciding for them. Tapping a
// selected chip removes it; if that was the first one, the next in line
// becomes primary, and the badge moves in front of the student so the change
// is never silent.

export function IntentPicker({ value, note, onChange, disabled }: {
  /** In the student's own picking order. value[0] is the primary. */
  value: SessionIntent[];
  note: string;
  onChange: (v: { intents: SessionIntent[]; note: string }) => void;
  disabled?: boolean;
}) {
  // 'other' anywhere requires the note, not only as the primary — picking a
  // real reason and then "Something else" with nothing written is the one
  // combination that carries no information at all.
  const needsNote = value.some((v) => intentNeedsNote(v));
  const noteTooShort = needsNote && note.trim().length < MIN_NOTE_LENGTH;
  const atCap = value.length >= MAX_INTENTS;

  function toggle(k: SessionIntent) {
    // Removing keeps the surviving order, so the second pick becomes primary
    // rather than the list being resorted under the student.
    const next = value.includes(k) ? value.filter((v) => v !== k) : [...value, k];
    if (next.length > MAX_INTENTS) return;
    onChange({ intents: next, note });
  }

  return (
    <div className="space-y-3">
      <div>
        <p className="text-[13px] font-bold text-stone-900">What would you like help with?</p>
        <p className="text-[11px] text-stone-500">
          Pick up to {MAX_INTENTS}. Your buddy sees these before the call
          {value.length > 1 ? ', and your first pick decides which buddy you get' : ''}.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SESSION_INTENTS.map((k) => {
          const idx = value.indexOf(k);
          const picked = idx >= 0;
          // A chip that cannot be tapped must look like it — but a PICKED chip
          // at the cap must stay tappable, or the student can never change
          // their mind without starting over.
          const blocked = !!disabled || (atCap && !picked);
          return (
            <button
              key={k}
              type="button"
              disabled={blocked}
              aria-pressed={picked}
              onClick={() => toggle(k)}
              className={`rounded-full px-3 py-1.5 text-[12px] font-semibold transition disabled:opacity-40 ${
                picked ? 'bg-teal-700 text-white' : 'border border-stone-200 bg-white text-stone-600'
              }`}
            >
              {idx === 0 && <span className="mr-1 rounded bg-white/25 px-1 text-[10px] font-bold">1st</span>}
              {INTENT_LABEL[k]}
            </button>
          );
        })}
      </div>

      {atCap && (
        <p className="text-[11px] text-stone-500">
          That&rsquo;s {MAX_INTENTS} — tap one again to swap it out. One session cannot fix more than that properly.
        </p>
      )}

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
          onChange={(e) => onChange({ intents: value, note: e.target.value })}
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

/**
 * Whether the booking may proceed. Mirrors validateIntents on the server.
 *
 * The reason stays MANDATORY: at least one pick, and 'other' anywhere still
 * needs its note.
 */
export function intentIsComplete(value: SessionIntent[], note: string): boolean {
  if (value.length === 0 || value.length > MAX_INTENTS) return false;
  if (value.some((v) => intentNeedsNote(v))) return note.trim().length >= MIN_NOTE_LENGTH;
  return true;
}
