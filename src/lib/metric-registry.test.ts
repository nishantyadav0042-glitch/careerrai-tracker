import { describe, it, expect } from 'vitest';
import {
  METRICS, ACCEPTED_EMPTY_COLUMNS,
  duplicateMetricIds, metricsWithMultipleOwners,
} from './metric-registry';

// The registry is only worth having if a build fails when it drifts. These are
// the invariants that would have caught every wrong number the audit found.

describe('metric registry invariants', () => {
  it('has no duplicate metric ids — one name, one truth', () => {
    expect(duplicateMetricIds()).toEqual([]);
  });

  it('computes each metric in exactly one place', () => {
    // "Active today" and "Students who got in" were byte-identical
    // computations under two labels. Two owners for one id means two places
    // that can drift apart; two ids for one owner is fine.
    expect(metricsWithMultipleOwners()).toEqual([]);
  });

  it('gives every metric a source, an owner and at least one surface', () => {
    for (const m of METRICS) {
      expect(m.id, 'metric id').toMatch(/^[a-z0-9_]+$/);
      expect(m.means.length, `${m.id} needs a plain-English meaning`).toBeGreaterThan(20);
      expect(m.source, `${m.id} needs a source table`).toBeTruthy();
      expect(m.requires.length, `${m.id} must name the columns it depends on`).toBeGreaterThan(0);
      expect(m.owner, `${m.id} needs exactly one owner`).toBeTruthy();
      expect(m.surfaces.length, `${m.id} is computed but never displayed — dead metric`).toBeGreaterThan(0);
    }
  });

  it('never depends on a column that is on the accepted-empty list', () => {
    // This is the exact shape of the read_at bug: a live metric reading a
    // column nothing writes. If a metric requires a column we have already
    // accepted as permanently empty, that metric is structurally zero.
    for (const m of METRICS) {
      for (const col of m.requires) {
        const key = `${m.source}.${col}`;
        expect(
          ACCEPTED_EMPTY_COLUMNS[key],
          `${m.id} reads ${key}, which is on the known-empty list — it can only ever render zero`,
        ).toBeUndefined();
      }
    }
  });

  it('gives every accepted-empty column a real reason, not a shrug', () => {
    for (const [col, reason] of Object.entries(ACCEPTED_EMPTY_COLUMNS)) {
      expect(col, 'accepted-empty keys are table.column').toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(reason.length, `${col} needs a reason someone can act on`).toBeGreaterThan(15);
    }
  });

  it('does not accept a column as empty in two conflicting ways', () => {
    const keys = Object.keys(ACCEPTED_EMPTY_COLUMNS);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('the push funnel is defined as three separate stages', () => {
  // Sent, delivered and tapped fail independently — roughly a third of pushes
  // handed to Google never reach a device. Collapsing them into one "open
  // rate" is how a 68%-delivery system looked like a 0%-open one.
  it('registers sent, delivered and tapped as distinct metrics', () => {
    const ids = METRICS.map((m) => m.id);
    expect(ids).toContain('push_sent');
    expect(ids).toContain('push_delivered');
    expect(ids).toContain('push_tapped');
  });

  it('never depends on read_at, the permanently dead column', () => {
    const cols = METRICS.filter((m) => m.id.startsWith('push_')).flatMap((m) => m.requires);
    expect(cols).not.toContain('read_at');
  });

  it('keeps tapped a strict subset of delivered', () => {
    // The failure an independent pass caught: delivered was defined as
    // received_at alone while tapped was clicked_at, and 22 of 43 taps had no
    // received_at. The tap rate divided a numerator by a denominator that
    // excluded half of it. Delivered must therefore accept clicked_at too.
    const delivered = METRICS.find((m) => m.id === 'push_delivered')!;
    const tapped = METRICS.find((m) => m.id === 'push_tapped')!;
    for (const col of tapped.requires) {
      expect(
        delivered.requires,
        `push_delivered must count ${col} as delivery, or push_tapped is not a subset of it`,
      ).toContain(col);
    }
  });
});

describe('the registry knows every surface, not just the one it was written for', () => {
  // The reason this test exists: the first version of this registry declared
  // dau with a single surface on /admin/launch while /admin/analytics computed
  // the same concept from a DIFFERENT definition. Every registry test passed,
  // because they only ever checked the registry against itself. A safeguard
  // that cannot detect the thing it was built to detect is worse than none —
  // it converts an unknown risk into a false sense of safety.
  it('lists every surface that displays a metric, across all dashboards', () => {
    const dau = METRICS.find((m) => m.id === 'dau')!;
    expect(dau.surfaces.some((s) => s.includes('/admin/launch'))).toBe(true);
    expect(dau.surfaces.some((s) => s.includes('/admin/analytics'))).toBe(true);
  });

  it('spells out the definition precisely enough to catch a rival one', () => {
    // "Distinct students who opened the app" is ambiguous enough that two
    // engineers implemented it two ways. The meaning must name the event.
    const dau = METRICS.find((m) => m.id === 'dau')!;
    expect(dau.means).toMatch(/app_open/);
  });
});

describe('the streak has exactly one source of truth', () => {
  it('reads streak_data, never profiles', () => {
    const streak = METRICS.find((m) => m.id === 'live_streak')!;
    expect(streak.source).toBe('streak_data');
    // profiles.current_streak is 0 for all 249 students. Two routes read it
    // there and told mentors their students had no streak.
    expect(ACCEPTED_EMPTY_COLUMNS['profiles.current_streak']).toBeDefined();
    expect(ACCEPTED_EMPTY_COLUMNS['profiles.last_log_date']).toBeDefined();
  });
});
