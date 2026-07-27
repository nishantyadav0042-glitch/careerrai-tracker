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

  it('sources each stage from its own column', () => {
    const cols = METRICS
      .filter((m) => m.id.startsWith('push_'))
      .flatMap((m) => m.requires);
    expect(new Set(cols).size).toBe(cols.length); // no stage reuses another's column
    expect(cols).not.toContain('read_at');        // the dead one, permanently
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
