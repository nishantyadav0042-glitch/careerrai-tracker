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

  it('the status chip wording comes from the SAME map PaceCard uses — one source, not two', () => {
    // 13 Aug incident: this map used to live inside pace-card.tsx, a
    // 'use client' file. PositionStrip (a plain server component) importing
    // it as a named const from there crashed Home in production — the import
    // resolved to undefined on the server. Fixed by moving the map to a
    // plain, boundary-free module both files import from identically.
    const strip = readFileSync(STRIP, 'utf8');
    const paceCard = readFileSync('src/components/home/pace-card.tsx', 'utf8');
    expect(strip).toContain("from '@/lib/pace-tone'");
    expect(paceCard).toContain("from '@/lib/pace-tone'");
    // Neither file may declare its own TONE any more.
    expect(strip).not.toMatch(/const TONE\s*[:=]/);
    expect(paceCard).not.toMatch(/const TONE\s*[:=]/);
  });

  it('the shared map lives in a module with no client-boundary directive anywhere it is imported from', () => {
    const tone = readFileSync('src/lib/pace-tone.ts', 'utf8');
    expect(tone).not.toContain("'use client'");
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
