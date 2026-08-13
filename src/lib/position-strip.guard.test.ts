import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// ── S3: the Position strip consolidates, it does not recompute ─────────────
//
// The founder's mock showed one dark strip carrying streak, syllabus date,
// coverage% and hours-today. Home already had every one of those numbers —
// split across a separate white streak pill and PaceCard below it. The only
// honest way to build this is composition: reuse the exact variables the page
// already computed for PaceCard, add zero new queries and zero new pace math.

const PAGE = 'src/app/student/tracker/page.tsx';
const STRIP = 'src/components/home/position-strip.tsx';

describe('PositionStrip reuses, never recomputes', () => {
  it('todayHours is read off the SAME hoursByDate map PaceCard’s sparkline uses', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toContain('const todayHours = hoursByDate.get(todayStr)');
  });

  it('the status chip wording is imported from PaceCard, not a second copy', () => {
    const strip = readFileSync(STRIP, 'utf8');
    expect(strip).toContain("import { TONE } from './pace-card'");
    const paceCard = readFileSync('src/components/home/pace-card.tsx', 'utf8');
    expect(paceCard).toMatch(/export const TONE/);
  });

  it('renders under the same gate PaceCard already uses — no new empty-state logic', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).toMatch(/\{pace && targetIso && \(\s*<PositionStrip/);
  });
});

describe('the old duplicate streak pill is gone, not just hidden behind the new one', () => {
  it('the greeting no longer renders its own streak card', () => {
    const src = readFileSync(PAGE, 'utf8');
    expect(src).not.toContain('day streak</div>');
  });

  it('PositionStrip is the only place Home renders a streak count now', () => {
    const src = readFileSync(PAGE, 'utf8');
    const streakStripUses = (src.match(/<PositionStrip/g) ?? []).length;
    expect(streakStripUses).toBe(1);
  });
});
