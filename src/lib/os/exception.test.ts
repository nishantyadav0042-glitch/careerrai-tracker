import { describe, it, expect } from 'vitest';
import {
  aggregate, shouldAggregate, maxSeverity, sortExceptions, type Exception,
} from './exception';

function ex(over: Partial<Exception>): Exception {
  return {
    id: 'x', code: 'captured_not_unlocked', domain: 'revenue',
    entity: { kind: 'student', id: 's1', label: 'Aarav' },
    severity: 'critical', reason: 'Premium activation incident', detectedAtMs: 1000,
    evidence: {}, suggestedAction: { label: 'Open', route: '/admin/payment/1' },
    recovery: { attempted: true, status: 'failed' }, owner: 'founder',
    destination: '/admin/revenue?state=captured_not_unlocked', lifecycle: 'detected',
    ...over,
  };
}

describe('The Exception Contract is one primitive for every domain', () => {
  it('ranks severity on one scale across domains', () => {
    expect(maxSeverity('normal', 'critical')).toBe('critical');
    expect(maxSeverity('high', 'normal')).toBe('high');
  });

  it('sorts critical first, then oldest first', () => {
    const out = sortExceptions([
      ex({ id: 'a', severity: 'normal', detectedAtMs: 1 }),
      ex({ id: 'b', severity: 'critical', detectedAtMs: 5 }),
      ex({ id: 'c', severity: 'critical', detectedAtMs: 2 }),
    ]);
    expect(out.map((e) => e.id)).toEqual(['c', 'b', 'a']);
  });

  it('aggregates identical problems into ONE incident, keeping the individuals', () => {
    const three = [
      ex({ id: '1', entity: { kind: 'student', id: 's1', label: 'A' }, evidence: { amountRupees: 2999 } }),
      ex({ id: '2', entity: { kind: 'student', id: 's2', label: 'B' }, evidence: { amountRupees: 2999 } }),
      ex({ id: '3', entity: { kind: 'student', id: 's3', label: 'C' }, evidence: { amountRupees: 999 } }),
    ];
    const [incident] = aggregate(three);
    expect(incident.affected).toBe(3);
    // Drill-down is never lost — the exact records survive on the incident.
    expect(incident.members.map((m) => m.entity.id)).toEqual(['s1', 's2', 's3']);
    // Money evidence rolls up.
    expect(incident.evidenceRollup.amountRupees).toBe(2999 + 2999 + 999);
    // The incident still points at the filter that lists exactly those records.
    expect(incident.drillDown).toBe('/admin/revenue?state=captured_not_unlocked');
  });

  it('separates different codes into different incidents', () => {
    const mixed = [
      ex({ id: '1', code: 'captured_not_unlocked', domain: 'revenue' }),
      ex({ id: '2', code: 'mentor_no_room', domain: 'mentor', severity: 'high' }),
      ex({ id: '3', code: 'captured_not_unlocked', domain: 'revenue' }),
    ];
    const incidents = aggregate(mixed);
    expect(incidents).toHaveLength(2);
    // Critical (the 2-member payment incident) ranks before the high mentor one.
    expect(incidents[0].code).toBe('captured_not_unlocked');
    expect(incidents[0].affected).toBe(2);
  });

  it('the aggregation threshold is presentation-only and business-tunable', () => {
    // Below threshold: show individuals. At/above: present as an incident.
    expect(shouldAggregate(2, 25)).toBe(false);
    expect(shouldAggregate(25, 25)).toBe(true);
    expect(shouldAggregate(300, 25)).toBe(true);
  });
});
