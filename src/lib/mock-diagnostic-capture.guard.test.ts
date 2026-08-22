import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { execSync } from 'node:child_process';

// ── A mock must arrive as a diagnosis, not a scoreboard ─────────────────────
//
// 22 Aug. Four independent research streams converged on the same answer for
// this product: the one thing a self-studying CAT aspirant cannot do alone is
// honestly diagnose their own performance. Only 11% of students self-test when
// studying alone (Karpicke 2009), and the weakest overestimate themselves by
// roughly 50 percentile points.
//
// Meanwhile the forensic found this: the scorecard parser extracts fifteen
// fields per mock, the server has always accepted them, the jsonb columns have
// always held them — and the CLIENT threw eleven away on every scan. A
// student's three-hour paper entered the database as at most four integers.
//
// percentile alone says a student did badly. attempted, correct and time_min
// are what say WHY. These guards keep the diagnostic fields attached.

const MODAL = readFileSync('src/components/DailyTracker/MockDebriefModal.tsx', 'utf8');
const ROUTE = readFileSync('src/app/api/logging/mock-debrief/route.ts', 'utf8');
const PARSER = readFileSync('src/app/api/parse-scorecard/route.ts', 'utf8');

describe('what the parser reads, the client keeps', () => {
  it('the parser still asks for accuracy and time, not just percentile', () => {
    for (const field of ['attempted', 'correct', 'time_min']) {
      expect(PARSER, `parser no longer extracts ${field}`).toContain(field);
    }
  });

  it('the scan handler carries every parsed field into state', () => {
    // THE regression. The old line was:
    //   fresh[key] = { percentile: s.percentile ?? null };
    // which read the whole section and kept one quarter of it.
    // The region between reading the parsed scorecard and reporting the scan.
    // Anchor the end search AT the start: `setScanResult` also names the
    // useState declaration far above, and an unanchored indexOf slices nothing.
    const from = MODAL.indexOf('const sc = json.scorecard');
    const scan = MODAL.slice(from, MODAL.indexOf('setScanResult(', from));
    expect(scan.length, 'the scan handler could not be located').toBeGreaterThan(0);
    for (const field of ['attempted', 'correct', 'time_min']) {
      expect(scan, `the scan drops ${field}`).toMatch(new RegExp(`${field}: s\\.${field}`));
    }
  });

  it('the section type can hold them — a narrower type is how they got lost', () => {
    expect(MODAL).toMatch(/attempted\?: number \| null/);
    expect(MODAL).toMatch(/correct\?: number \| null/);
    expect(MODAL).toMatch(/time_min\?: number \| null/);
    // One type for the payload and the local state, so they cannot drift apart.
    expect(MODAL).toContain('type SectionData = MockSectionData;');
  });

  it('the submit sends whole sections, never a hand-picked subset', () => {
    // Rebuilding the object field-by-field here is exactly how the fields were
    // dropped the first time.
    const submit = MODAL.slice(MODAL.indexOf('await onSubmit({'), MODAL.indexOf('onClose();'));
    expect(submit).toMatch(/varc: sections\.varc/);
    expect(submit).toMatch(/dilr: sections\.dilr/);
    expect(submit).toMatch(/qa: sections\.qa/);
    expect(submit).not.toMatch(/percentile:\s*sections\./);
  });

  it('the server still accepts what the client now sends', () => {
    expect(ROUTE).toMatch(/attempted: number; correct: number; time_min: number/);
  });
});

describe('we never advertise a capability we do not have', () => {
  it('the evidence announcement is gone while the capture is gone', () => {
    // It promised "log your correct answers… your progress shows what you can
    // actually score on" and its only button was "Got it". The capture UI had
    // been deleted on 14 Aug; the advertisement kept shipping to every student
    // older than two days.
    expect(existsSync('src/components/evidence-announce.tsx')).toBe(false);
    const layout = readFileSync('src/app/student/layout.tsx', 'utf8');
    expect(layout).not.toMatch(/<EvidenceAnnounce/);
  });

  it('if the practice-capture door reopens, it must have a real caller', () => {
    // POST /api/evidence is live and orphaned — "the one write that turns an
    // opinion into evidence", called by nothing. Restoring the ANNOUNCEMENT
    // without restoring the CAPTURE is the exact mistake this pins.
    const evidenceRoute = 'src/app/api/evidence/route.ts';
    if (!existsSync(evidenceRoute)) return; // route retired entirely — fine
    const callers = ['src/components', 'src/app/student'].flatMap((dir) => {
      try {
        return execSync(`grep -rl "api/evidence" ${dir} 2>/dev/null || true`, { encoding: 'utf8' })
          .split('\n')
          .filter(Boolean);
      } catch {
        return [];
      }
    });
    const announces = existsSync('src/components/evidence-announce.tsx');
    expect(
      !announces || callers.length > 0,
      'the evidence announcement is back but nothing calls POST /api/evidence',
    ).toBe(true);
  });
});
