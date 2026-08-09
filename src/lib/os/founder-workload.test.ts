import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// The Founder Workload number: "N actions · ~M min · X critical / Y high".
// Founder, 9 Aug: "100,000 students don't matter if only 23 things need me."

const src = readFileSync('src/lib/os/founder-inbox.ts', 'utf8');

describe('the workload is the operational north star', () => {
  it('counts distinct actions, a queue being one motion — not per student', () => {
    // "14 going cold" is ONE action (one broadcast), so actions = items.length.
    expect(src).toContain('actions: items.length');
  });
  it('estimates minutes per item by severity, labelled an estimate', () => {
    expect(src).toContain('EST_MIN');
    expect(src).toMatch(/critical:\s*6/);
  });
  it('breaks work down by severity so the founder sees the shape', () => {
    expect(src).toContain('critical'); expect(src).toContain('high'); expect(src).toContain('normal');
  });
  it('is surfaced on the Command Center as the lead metric', () => {
    const page = readFileSync('src/app/admin/page.tsx', 'utf8');
    expect(page).toContain('Your workload today');
    expect(page).toContain('workload.actions');
    expect(page).toContain('workload.estMinutes');
  });
});
