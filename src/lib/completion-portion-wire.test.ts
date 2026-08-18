import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { toClientCompletions, type CompletionRow } from './completion-portion';

// ── P0-2.1 — THE PORTION MUST SURVIVE THE WIRE ──────────────────────────────
//
// P0-2 taught the SERVER that a half-tick is partial. It did not tell the
// CLIENT: `/api/routine/today` selected `task_id, completed_at, is_emergency`
// and never `confidence`, so TodaysRoutineCard and LoggingModal collapse every
// completion into one "done" set and render a half-tick as fully done.
//
// Founder ruling, 18 Aug: "If the system knows a task is PARTIAL, the UI must
// never represent it as FULL." And, equally binding: the VISUAL treatment of
// PARTIAL is not decided here. This change carries the truth to the component
// boundary and stops.
//
// ONE authority, one interpretation. The route does not read `confidence` and
// decide for itself — it calls the same module the day-closure path uses, and
// emits a canonical `portion`. `confidence` itself never crosses the wire,
// because a second copy on the client is a second place for the meaning to
// drift (the eleven-coverage-producers failure, one layer out).

describe('the wire shape carries a canonical portion, never a raw signal', () => {
  const rows: CompletionRow[] = [
    { task_id: 'a', is_emergency: false, confidence: 'green' },
    { task_id: 'b', is_emergency: false, confidence: 'blue' },
    { task_id: 'c', is_emergency: true, confidence: null },
    { task_id: 'd', is_emergency: false, confidence: 'yellow' },
    { task_id: 'e', is_emergency: false, confidence: 'red' },
  ];

  it('a full completion reaches the client as full', () => {
    expect(toClientCompletions(rows).find((c) => c.task_id === 'a')!.portion).toBe('full');
  });

  it('a PARTIAL completion reaches the client as partial', () => {
    expect(toClientCompletions(rows).find((c) => c.task_id === 'b')!.portion).toBe('half');
  });

  it('a legacy null-confidence completion stays FULL', () => {
    // The documented historical rule: all 29 such rows are 12-15 Jul, written
    // when the UI had no half option. They are not upgraded to a new semantic.
    expect(toClientCompletions(rows).find((c) => c.task_id === 'c')!.portion).toBe('full');
  });

  it('struggle signals stay full — untouched by this ruling', () => {
    expect(toClientCompletions(rows).find((c) => c.task_id === 'd')!.portion).toBe('full');
    expect(toClientCompletions(rows).find((c) => c.task_id === 'e')!.portion).toBe('full');
  });

  it('never emits the raw confidence signal', () => {
    for (const c of toClientCompletions(rows)) {
      expect(Object.keys(c).sort()).toEqual(['is_emergency', 'portion', 'task_id']);
    }
  });

  it('normalises is_emergency rather than passing null through', () => {
    const [only] = toClientCompletions([{ task_id: 'x', confidence: 'green' }]);
    expect(only.is_emergency).toBe(false);
  });

  it('a partial can never be produced by accident from an unknown signal', () => {
    // Fail-closed in the direction that matters: only the one declared half
    // signal yields 'half'. Anything unrecognised is full, which is what every
    // existing production row already means.
    for (const c of ['', 'BLUE', 'half', 'partial', 'green ', undefined]) {
      expect(toClientCompletions([{ task_id: 'x', confidence: c as string }])[0].portion, String(c)).toBe('full');
    }
  });
});

describe('the route emits the portion and interprets nothing itself', () => {
  const src = readFileSync(join(process.cwd(), 'src/app/api/routine/today/route.ts'), 'utf8');
  const code = src.split('\n')
    .filter((l) => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');

  it('selects confidence, so the truth is available at all', () => {
    const block = code.slice(code.indexOf("from('routine_task_completions')"),
      code.indexOf("from('routine_task_completions')") + 260);
    expect(block).toContain('confidence');
  });

  it('maps through the one authority', () => {
    expect(code).toContain('toClientCompletions');
  });

  it('does not re-interpret the signal in the route', () => {
    expect(code).not.toMatch(/===\s*'blue'/);
    expect(code).not.toContain('portionOf(');
  });
});

describe('the client is handed the portion and does not decide it', () => {
  const card = readFileSync(join(process.cwd(), 'src/components/DailyTracker/TodaysRoutineCard.tsx'), 'utf8');
  const modal = readFileSync(join(process.cwd(), 'src/components/DailyTracker/LoggingModal.tsx'), 'utf8');

  it('the card declares the portion in its completion type', () => {
    expect(card).toMatch(/completions:\s*\{[^}]*portion/);
  });

  it('neither component interprets a raw confidence signal to decide doneness', () => {
    // LoggingModal still MAPS a choice to a signal on the way out (full ->
    // green, half -> blue) — that is the writer, and tick-is-the-log guards it.
    // What neither may do is read a stored signal and decide what it means.
    expect(card).not.toMatch(/confidence\s*===\s*'blue'/);
    expect(modal).not.toMatch(/confidence\s*===\s*'blue'/);
  });
});
