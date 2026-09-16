/**
 * ── The Command Center may not print an unfinished count as a finished one ──
 *
 * 16 Sep 2026, 09:36 IST. The founder read LOGGED YESTERDAY 12 beside a
 * remembered 30 and asked what had collapsed. Nothing had: 78% of a day's logs
 * are written the next day, mostly after 10:00 IST, so at breakfast
 * "yesterday" is about a fifth of its eventual number.
 *
 * This guard holds three things shut:
 *   · the two still-filling tiles carry their maturity ON the tile;
 *   · the reader is given a settled number to compare against;
 *   · the tiles still point at the same People lists they count from, which is
 *     the invariant this whole surface exists for (admin-filters doctrine) —
 *     re-pointing a tile at a settled day without moving `ActivityState` would
 *     break it, and is exactly what was NOT done here.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PAGE = join(__dirname, '..', '..', 'app', 'admin', 'page.tsx');
const src = () => readFileSync(PAGE, 'utf8');
const code = () => src().replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the still-filling tiles say so', () => {
  it('both today and yesterday carry a note', () => {
    const s = code();
    const today = s.slice(s.indexOf('label="Logged today"'), s.indexOf('label="Logged yesterday"'));
    const yday = s.slice(s.indexOf('label="Logged yesterday"'), s.indexOf('label="Logged this week"'));
    expect(today, 'today is the least finished number on the screen').toContain('note=');
    expect(yday, 'yesterday is the one that misled').toContain('note=');
    expect(today).toContain('still filling');
    expect(yday).toContain('still filling');
  });

  it('the note renders on the tile, not only in a caption', () => {
    // A caption below the row is read AFTER the two numbers have already been
    // compared. That is the whole failure.
    const s = code();
    const tile = s.slice(s.indexOf('function ContextTile'));
    expect(tile.slice(0, tile.indexOf('\n}'))).toContain('{note}');
  });

  it('the share is measured, never a number typed into the page', () => {
    const s = code();
    expect(s).toContain('maturity.todaySharePct');
    expect(s).toContain('maturity.yesterdaySharePct');
    // No hardcoded percentage may stand in for the measurement.
    const notes = s.match(/note=\{[^}]*\}/g) ?? [];
    expect(notes.length).toBeGreaterThan(0);
    for (const n of notes) expect(n, `a typed-in share goes stale: ${n}`).not.toMatch(/\d+%/);
  });

  it('an unmeasurable share degrades to "still filling", never to a guess', () => {
    // ENGINEERING-MEMORY L1: a trustworthy UNKNOWN beats a precise lie.
    const s = code();
    expect(s).toMatch(/todaySharePct == null \? 'still filling'/);
    expect(s).toMatch(/yesterdaySharePct == null \? 'still filling'/);
  });
});

describe('the reader gets something they can actually compare against', () => {
  it('the last settled day is shown with its count', () => {
    const s = code();
    expect(s).toContain('maturity.settledDay');
    expect(s).toContain('maturity.settledCount');
    expect(src()).toMatch(/Last settled day/);
  });

  it('and it is hidden rather than faked when there is none', () => {
    expect(code()).toMatch(/maturity\.settledDay != null && maturity\.settledCount != null/);
  });
});

describe('the count and the list behind it still agree', () => {
  it('the tiles point at the same days they count', () => {
    // Deliberately unchanged: `ActivityState` derives from days-since-log
    // across the app, so moving a tile to a settled day would separate the
    // number from the list it drills into.
    const s = code();
    expect(s).toContain('href="/admin/people?activity=today"');
    expect(s).toContain('href="/admin/people?activity=yesterday"');
    expect(s).toContain('href="/admin/people?activity=this_week"');
  });

  it('a failed maturity read costs the note, never the page', () => {
    const s = code();
    expect(s).toMatch(/readLogMaturity\(admin, now\)\s*\.catch/);
  });

  it('the honest caveat about what a log IS survives', () => {
    // Half of all log rows record no study. The maturity note must not have
    // displaced the caveat that stops "logged" being quoted as "studied".
    expect(src()).toMatch(/A log is a student answering, not a student studying/);
  });
});
