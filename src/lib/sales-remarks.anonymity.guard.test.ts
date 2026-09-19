import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '@/lib/test-support/code-only';
import { buildRemarkHistories, maskAuthorName, TEAM_LABEL } from './sales-remarks';

// ── A COLLEAGUE WHO LEFT IS NOT A NAME THE NEXT REP NEEDS ───────────────────
//
// Founder, 19 Sep 2026: "think like we have only one rep with us … never use
// her name in [the remaining rep's] profile."
//
// Measured that night against production, the departing rep's name reached
// the remaining rep two ways, and a fix for only the first would have looked
// complete while 251 rows still carried it:
//   1. the attribution line — 770 remarks across 245 of his students;
//   2. inside the words she typed — "This is <name> from CareerRai".
//
// Both are asserted below, plus the three things that must NOT change: the
// record in the database, the "somebody else wrote this" signal, and the
// rep's own name on his own remarks.

const ROWS = (note: string, actor: string) => ([{
  student_id: 's1', created_at: '2026-09-18T10:00:00.000Z', status: 'interested',
  note, actor_id: actor, provenance: 'self_reported',
}] as never[]);

const LABELS = new Map([['rep-gone', 'Priya Sharma'], ['rep-here', 'Anshul Yadav']]);
const read = (p: string) => codeOnly(readFileSync(join(process.cwd(), p), 'utf8'));

describe('a former colleague is shown as the team, never by name', () => {
  it('drops the name from the attribution line', () => {
    const h = buildRemarkHistories(ROWS('She said call back Monday', 'rep-gone'), LABELS, 5, 'rep-here');
    expect(h.get('s1')!.remarks[0].by).toBe(TEAM_LABEL);
  });

  it('drops the name from inside what they typed', () => {
    // The exact shape found in production, 251 rows of it.
    const h = buildRemarkHistories(
      ROWS('Good Evening! This is Priya from CareerRai. Is this a convenient time?', 'rep-gone'),
      LABELS, 5, 'rep-here',
    );
    const note = h.get('s1')!.remarks[0].note!;
    expect(note).not.toMatch(/priya/i);
    expect(note).toContain(TEAM_LABEL);
  });

  it('drops a full name as well as a first name', () => {
    const h = buildRemarkHistories(ROWS('Priya Sharma spoke to him on Tuesday', 'rep-gone'), LABELS, 5, 'rep-here');
    const note = h.get('s1')!.remarks[0].note!;
    expect(note).not.toMatch(/priya|sharma/i);
    // ...and does not leave "CareerRai team CareerRai team" behind.
    expect(note).not.toMatch(new RegExp(`${TEAM_LABEL}\\s+${TEAM_LABEL}`));
  });

  it('leaves the rep\'s OWN name and words alone', () => {
    const h = buildRemarkHistories(ROWS('Anshul called, student was in class', 'rep-here'), LABELS, 5, 'rep-here');
    const r = h.get('s1')!.remarks[0];
    expect(r.note).toBe('Anshul called, student was in class');
    expect(r.by).toBe('Anshul Yadav');
  });

  it('keeps the "somebody else wrote this" signal', () => {
    // Founder, 4 Sep: attribution exists so a rep knows they are quoting a
    // colleague. Remove the name AND the signal and he reads a stranger's
    // words as his own, then tells a student "as I mentioned last time"
    // about a call he never made. The identity goes; the signal stays.
    const h = buildRemarkHistories(ROWS('Wants to start after exams', 'rep-gone'), LABELS, 5, 'rep-here');
    expect(h.get('s1')!.remarks[0].by).not.toBeNull();
  });

  it('masks nothing when no viewer is given (the 360, tests)', () => {
    const h = buildRemarkHistories(ROWS('This is Priya from CareerRai', 'rep-gone'), LABELS, 5);
    expect(h.get('s1')!.remarks[0].note).toContain('Priya');
    expect(h.get('s1')!.remarks[0].by).toBe('Priya Sharma');
  });
});

describe('maskAuthorName never mangles a note on a guess', () => {
  it.each([
    ['no author', 'This is Priya from CareerRai', null],
    ['no note', null, 'Priya Sharma'],
  ])('%s leaves it untouched', (_n, note, author) => {
    expect(maskAuthorName(note as string | null, author as string | null)).toBe(note);
  });

  it('ignores name fragments shorter than three letters', () => {
    // A two-letter token would match inside ordinary words and shred the note.
    expect(maskAuthorName('He said ok to a call', 'Jo K')).toBe('He said ok to a call');
  });

  it('does not match a name inside a longer word', () => {
    expect(maskAuthorName('Sent the priyanka link', 'Priya Sharma')).toBe('Sent the priyanka link');
  });
});

// ── NO NAME IN THE SOURCE ───────────────────────────────────────────────────
//
// This repository is public. A hard-coded "hide this person" list would
// publish the very fact it exists to conceal, and would need editing at every
// departure. The name is derived at runtime from the row's own author.
describe('the rule names nobody in code', () => {
  it('derives the name to mask from the data, not a literal', () => {
    const src = read('src/lib/sales-remarks.ts');
    expect(src).toMatch(/maskAuthorName\(/);
    expect(src).toMatch(/authorLabel/);
  });

  it('the queue passes the viewer, or nothing is ever masked', () => {
    // The whole fix is inert if the call site omits the current rep — the
    // kind of gap that leaves a guard passing while production still leaks.
    const src = read('src/lib/call-queue.ts');
    expect(src).toMatch(/buildRemarkHistories\([\s\S]{0,200}viewer\?\.id/);
  });
});
