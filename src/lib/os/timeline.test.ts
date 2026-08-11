import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { TIMELINE_KINDS, FORBIDDEN_KINDS, type TimelineKind } from './timeline';

// ── The timeline is decisions, not logs ─────────────────────────────────────
//
// Co-founder rule: "every timeline event answers 'so what?'. Good: subscribed,
// buddy assigned, OCR failed, refunded. Bad: opened app, clicked, viewed page."
// These tests keep the timeline from quietly rotting back into an analytics log.

describe('only decisions are allowed on the timeline', () => {
  it('every allowed kind is a decision, never a page-view or a tap', () => {
    const kinds = Object.keys(TIMELINE_KINDS) as TimelineKind[];
    expect(kinds.length).toBeGreaterThan(3);
    for (const k of kinds) {
      for (const noise of FORBIDDEN_KINDS) {
        expect(k, `"${k}" looks like a log event, not a decision`).not.toContain(noise);
      }
    }
  });

  it('every kind maps to a real domain — money, mentor or study', () => {
    for (const domain of Object.values(TIMELINE_KINDS)) {
      expect(['money', 'mentor', 'study']).toContain(domain);
    }
  });

  it('the noise list names the events that must never appear', () => {
    // If someone adds `app_open` to TIMELINE_KINDS, the first test fails; this
    // asserts the guard itself still covers the obvious offenders.
    for (const noise of ['app_open', 'screen_view', 'tap', 'click']) {
      expect(FORBIDDEN_KINDS as readonly string[]).toContain(noise);
    }
  });
});

describe('the emitters actually fire on the decision paths', () => {
  // Each of these files is a write path that makes one of the decisions above.
  // If a refactor drops the emit call, the story goes silent — so the wiring
  // is pinned here, not just the shape of the emitter.
  const wiring: Record<string, string> = {
    'src/lib/activate-payment.ts': "kind: 'subscribed'",
    'src/app/api/payments/webhook/route.ts': "kind: 'refunded'",
    'src/app/api/admin/assign-buddy/route.ts': "buddy_id ? 'buddy_assigned'",
    'src/app/api/cron/release-stale-sessions/route.ts': "kind: 'session_expired'",
    'src/app/api/timetable/parse/route.ts': "kind: 'ocr_failed'",
    'src/app/api/admin/scholarships/route.ts': "kind: 'scholarship_granted'",
  };

  it('every decision path calls emitTimeline with the right kind', () => {
    for (const [file, needle] of Object.entries(wiring)) {
      const src = readFileSync(file, 'utf8');
      expect(src, `${file} no longer imports the timeline emitter`).toContain('emitTimeline');
      expect(src, `${file} lost its ${needle} emit`).toContain(needle);
    }
  });
});

describe('no app write path logs a raw analytics event as a timeline decision', () => {
  it('the timeline table is written ONLY through emitTimeline', () => {
    // A stray `from('timeline_events').insert` elsewhere would bypass the
    // allowed-kinds discipline. The one legitimate writer is lib/os/timeline.
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir)) {
        const p = join(dir, e);
        if (statSync(p).isDirectory()) walk(p);
        else if (/\.tsx?$/.test(p) && !p.endsWith('timeline.ts') && !p.endsWith('.test.ts')) {
          if (readFileSync(p, 'utf8').includes("from('timeline_events')")) offenders.push(p);
        }
      }
    };
    walk('src');
    expect(offenders, 'these write the timeline table directly instead of via emitTimeline').toEqual([]);
  });
});
