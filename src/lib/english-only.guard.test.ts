import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// Founder, 8 Aug: "Every code or every word you are putting into the app or the
// code is in English only."
//
// He was right to check. Over one long day of Hinglish conversation I had
// pasted his own words, in Devanagari, into ten source files as comments —
// study-pace, timetable-month, daily-hours, busy-day, the signup screen, two
// test files, a route, a migration and a research doc. None of it ever reached
// a student; every occurrence was inside a comment. But a codebase half the
// team cannot read is a codebase half the team cannot review, and "it was only
// a comment" is how that starts.
//
// This test is the rule made mechanical. Quote the founder by all means — in
// English, as a translation.

// The brand is the one deliberate exception: the product's name is rendered
// with a Devanagari second word, on purpose, to every student.
const BRAND_ALLOWED = new Set(['src/components/logo.tsx']);

// U+0900-U+097F Devanagari, plus the Extended and Vedic Extensions blocks so
// a paste from a different keyboard cannot slip past the main range. Written
// as escapes rather than literal characters — otherwise this file would fail
// its own check, which is funny exactly once.
const DEVANAGARI = /[\u0900-\u097F\uA8E0-\uA8FF\u1CD0-\u1CFF]/;

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry.startsWith('.')) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx|js|jsx|sql|json|md)$/.test(full)) out.push(full);
  }
  return out;
}

describe('the codebase is English only', () => {
  it('no Devanagari anywhere in src, outside the brand mark', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      if (BRAND_ALLOWED.has(file)) continue;
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (DEVANAGARI.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('none in the migrations either — they outlive every conversation', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('supabase')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (DEVANAGARI.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('none in docs — an outside reviewer has to be able to read them', () => {
    // Gemini, ChatGPT and any engineer who joins get handed these documents.
    const offenders: string[] = [];
    for (const file of sourceFiles('docs')) {
      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (DEVANAGARI.test(line)) offenders.push(`${file}:${i + 1}`);
      });
    }
    expect(offenders).toEqual([]);
  });

  it('the brand mark is still there — this is a language rule, not a rebrand', () => {
    // If the exception ever stops being needed, delete the allowlist entry
    // deliberately rather than letting this test quietly pass on nothing.
    expect(readFileSync('src/components/logo.tsx', 'utf8')).toMatch(DEVANAGARI);
  });
});
