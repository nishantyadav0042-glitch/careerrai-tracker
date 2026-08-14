import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { readableMinutes, PREVIEW_ROWS } from '@/components/onboarding/plan-snapshot';

// ── The install screen's proof ──────────────────────────────────────────────
//
// Founder, 14 Aug: "show a snapshot of how you timetable… so they feel ki yaar
// kuch tagda dekhne ko milne wala hai, and they don't skip app install."
//
// A preview shown to win an install is the single most tempting place in the
// product to fabricate — a hand-written "sample day" would look better than a
// real one every time. It is also the worst place to be caught, because the
// next screen shows the real plan. So the guards below are about one thing:
// the snapshot is this student's own generated day, or it is nothing.

const SNAP = 'src/components/onboarding/plan-snapshot.tsx';
const SEQUENCE = 'src/components/post-signup-sequence.tsx';

describe('the preview is the real plan or it is nothing', () => {
  it('reads the same route the app itself reads', () => {
    const s = readFileSync(SNAP, 'utf8');
    expect(s).toContain("fetch('/api/routine/today')");
  });

  it('renders nothing when the plan cannot be loaded', () => {
    // The failure path must be silence, not a placeholder day. The screen
    // around it still stands on its own copy.
    const s = readFileSync(SNAP, 'utf8');
    expect(s).toContain('if (failed) return null;');
    expect(s).toMatch(/if \(tasks\.length === 0\) \{ setFailed\(true\); return; \}/);
  });

  it('carries no sample topics, minutes or targets of its own', () => {
    // Every topic name, target and duration on screen must have come from the
    // response. A literal here would be an invented plan (TRUST-OS rule 1).
    const s = readFileSync(SNAP, 'utf8');
    const body = s.slice(s.indexOf('export function PlanSnapshot'));
    for (const invented of ['Time, Speed', 'Arrangements', 'Reading Comp', 'Solve 15', 'Sample', 'e.g.']) {
      expect(body).not.toContain(invented);
    }
    expect(body).toContain('{t.topic ?? t.label}');
    expect(body).toContain('{t.estMinutes}m');
  });
});

describe('nothing here is locked behind the install', () => {
  it('does not blur, lock or gate the preview', () => {
    // A teaser says "we built something good and we are holding it hostage" —
    // and a student who cannot unlock it leaves rather than installs. The plan
    // is theirs either way; the app is only how it arrives each morning.
    const s = readFileSync(SNAP, 'utf8');
    expect(s).not.toMatch(/blur-|backdrop-blur|Unlock|🔒/);
  });

  it('the install screen still lets a student continue without installing', () => {
    const s = readFileSync(SEQUENCE, 'utf8');
    const screen = s.slice(s.indexOf("step === 'installFirst'"), s.indexOf("step === 'openApp'"));
    expect(screen).toContain('Continue →');
  });
});

describe('proof comes before the ask', () => {
  it('the snapshot renders above the install button', () => {
    // Reversed, this is just another app promising it will be useful — which
    // is the version that was not converting.
    const s = readFileSync(SEQUENCE, 'utf8');
    const screen = s.slice(s.indexOf("step === 'installFirst'"), s.indexOf("step === 'openApp'"));
    expect(screen.indexOf('<PlanSnapshot />')).toBeGreaterThan(-1);
    expect(screen.indexOf('<PlanSnapshot />')).toBeLessThan(screen.indexOf('<InstallButton'));
  });

  it('is measurable against installs', () => {
    const s = readFileSync(SNAP, 'utf8');
    expect(s).toContain("track('plan_snapshot_shown'");
    expect(readFileSync('src/lib/journey.ts', 'utf8')).toContain("'plan_snapshot_shown'");
  });
});

describe('durations read like a timetable, not a spreadsheet', () => {
  it('renders hours and minutes, never a decimal', () => {
    expect(readableMinutes(200)).toBe('3h 20m');
    expect(readableMinutes(45)).toBe('45m');
    expect(readableMinutes(120)).toBe('2h');
    expect(readableMinutes(0)).toBe('0m');
    expect(readableMinutes(61)).toBe('1h 1m');
  });

  it('shows a short list, so the card stays a snapshot', () => {
    expect(PREVIEW_ROWS).toBe(3);
  });
});
