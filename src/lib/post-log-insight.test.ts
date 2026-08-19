import { describe, it, expect } from 'vitest';
import { postLogInsight, RETURN_GAP_DAYS, type PostLogEvidence } from '@/lib/post-log-insight';

const base: PostLogEvidence = {
  advancedToday: [], sectionsToday: [], daysSinceSection: {},
  plannedToday: 0, weightedDoneToday: 0, logCount: 10,
};
const ev = (o: Partial<PostLogEvidence>): PostLogEvidence => ({ ...base, ...o });

describe('postLogInsight — a topic that climbed the ladder', () => {
  it('names the topic and the rung it now sits on', () => {
    const r = postLogInsight(ev({ advancedToday: [{ topic: 'Percentages', status: 'practicing' }] }));
    expect(r?.kind).toBe('coverage_advance');
    expect(r?.text).toContain('Percentages');
    expect(r?.text).toContain('Practising');
  });

  it('summarises when several topics moved', () => {
    const r = postLogInsight(ev({ advancedToday: [
      { topic: 'A', status: 'practicing' },
      { topic: 'B', status: 'revising' },
      { topic: 'C', status: 'exam_ready' },
    ] }));
    expect(r?.text).toContain('3 topics');
  });

  it('says nothing for a first touch landing on Learning', () => {
    // Announcing `learning` would be announcing that the student tapped
    // something. The rungs above it are earned by repeated work.
    const r = postLogInsight(ev({ advancedToday: [{ topic: 'Circles', status: 'learning' }] }));
    expect(r).toBeNull();
  });

  it('says nothing for a not_started row touched today', () => {
    const r = postLogInsight(ev({ advancedToday: [{ topic: 'Circles', status: 'not_started' }] }));
    expect(r).toBeNull();
  });
});

describe('postLogInsight — coming back to an avoided section', () => {
  it('names the section and the gap', () => {
    const r = postLogInsight(ev({ sectionsToday: ['DILR'], daysSinceSection: { DILR: 4 } }));
    expect(r?.kind).toBe('section_return');
    expect(r?.text).toContain('DILR');
    expect(r?.text).toContain('4 days');
  });

  it('stays quiet for a gap below the threshold', () => {
    const r = postLogInsight(ev({ sectionsToday: ['DILR'], daysSinceSection: { DILR: RETURN_GAP_DAYS - 1 } }));
    expect(r).toBeNull();
  });

  it('picks the longest gap when two sections returned', () => {
    const r = postLogInsight(ev({
      sectionsToday: ['VARC', 'DILR'], daysSinceSection: { VARC: 3, DILR: 7 },
    }));
    expect(r?.text).toContain('DILR');
  });

  it('says nothing about a section never logged before (null gap)', () => {
    // null means "no prior record", which is not the same as a long gap and
    // must not be rendered as "you came back after null days".
    const r = postLogInsight(ev({ sectionsToday: ['QA'], daysSinceSection: { QA: null } }));
    expect(r).toBeNull();
  });
});

describe('postLogInsight — finishing the plan', () => {
  it('fires when the weighted count meets the plan', () => {
    const r = postLogInsight(ev({ plannedToday: 4, weightedDoneToday: 4 }));
    expect(r?.kind).toBe('plan_finished');
    expect(r?.text).toContain('4');
  });

  it('does NOT fire when the day was all half-ticks', () => {
    // 4 planned, 4 half-ticks = 2.0 weighted. Not a finished plan, and saying
    // so would undo the half-tick ruling.
    const r = postLogInsight(ev({ plannedToday: 4, weightedDoneToday: 2 }));
    expect(r).toBeNull();
  });

  it('does not fire on a day with no plan', () => {
    expect(postLogInsight(ev({ plannedToday: 0, weightedDoneToday: 0 }))).toBeNull();
  });
});

describe('postLogInsight — the second log, where students were getting silence', () => {
  it('says something honest on log 2', () => {
    const r = postLogInsight(ev({ logCount: 2 }));
    expect(r?.kind).toBe('pattern_forming');
    expect(r?.text).toMatch(/pattern/i);
  });

  it('says something honest on log 3', () => {
    expect(postLogInsight(ev({ logCount: 3 }))?.kind).toBe('pattern_forming');
  });

  it('claims no pattern it cannot see', () => {
    const r = postLogInsight(ev({ logCount: 2 }));
    // It must describe the SYSTEM's state, never assert a finding about the
    // student — no "improving", "consistent", "on track".
    expect(r?.text).not.toMatch(/improv|consistent|on track|great|well done/i);
  });

  it('stops once there is real history', () => {
    expect(postLogInsight(ev({ logCount: 4 }))).toBeNull();
  });
});

describe('postLogInsight — silence is a valid answer', () => {
  it('returns null when nothing true can be said', () => {
    expect(postLogInsight(base)).toBeNull();
  });

  it('never attaches a human-intervention CTA', () => {
    // The CTA budget: no rule in this module may offer a Buddy. Held here and
    // structurally in cta-budget.guard.test.ts.
    const cases: PostLogEvidence[] = [
      ev({ advancedToday: [{ topic: 'X', status: 'practicing' }] }),
      ev({ sectionsToday: ['DILR'], daysSinceSection: { DILR: 9 } }),
      ev({ plannedToday: 2, weightedDoneToday: 2 }),
      ev({ logCount: 2 }),
    ];
    for (const c of cases) {
      const r = postLogInsight(c);
      expect(r).not.toBeNull();
      expect((r as unknown as { intervention?: unknown }).intervention).toBeUndefined();
    }
  });

  it('prefers the student’s own movement over the honest-absence line', () => {
    // A student on log 2 who also advanced a topic should hear about the topic.
    const r = postLogInsight(ev({ logCount: 2, advancedToday: [{ topic: 'Ratios', status: 'practicing' }] }));
    expect(r?.kind).toBe('coverage_advance');
  });
});
