import { describe, it, expect } from 'vitest';
import { phaseForTopic, targetPhrase, type Phase } from './routine-engine';

// Incident #20. A real paying student, 5 Aug, to his buddy:
//   "Bhaiya jo already completed hai wahi aa rha phir se krne ko kyu?"
// His plan card read "Learn Editorial Reading, solve 12 questions" for a topic
// he had marked PRACTISING — and printed "Finish what you started" as the
// reason directly underneath. One card, two sources, contradicting each other.
//
// Cause: the task VERB came from the day's calendar phase (August =
// 'foundation' for everyone), never from the topic's own coverage status.
// These tests pin that the verb now follows the topic.

describe('the verb follows the TOPIC, not the calendar', () => {
  const august: Phase = 'foundation'; // what the calendar says in August

  it('a topic being practised is never re-taught', () => {
    expect(phaseForTopic('practicing', august)).toBe('intensive');
    expect(targetPhrase('VARC', 'Editorial Reading', 120, phaseForTopic('practicing', august)))
      .not.toMatch(/^Learn /);
  });

  it('a topic in revision asks for retrieval, not first contact', () => {
    expect(phaseForTopic('revising', august)).toBe('revision');
    expect(phaseForTopic('exam_ready', august)).toBe('revision');
  });

  it('a genuinely new topic still says Learn — we did not break the real case', () => {
    expect(phaseForTopic('not_started', august)).toBe('foundation');
    expect(phaseForTopic('learning', august)).toBe('foundation');
    expect(targetPhrase('QA', 'Percentages', 108, phaseForTopic('learning', august)))
      .toMatch(/^Learn Percentages/);
  });

  it('falls back to the calendar only when the topic has no status at all', () => {
    expect(phaseForTopic(null, 'revision')).toBe('revision');
    expect(phaseForTopic(undefined, 'intensive')).toBe('intensive');
  });

  it('a not-started topic in November still says Learn, not Revise', () => {
    // The calendar would say 'revision' for everyone in November. A topic the
    // student never opened must still be taught — status beats calendar in
    // BOTH directions, which is what makes it evidence rather than a guess.
    expect(phaseForTopic('not_started', 'revision')).toBe('foundation');
  });
});

describe("Harsh's actual plan card, 5 Aug — the exact regression", () => {
  // His real coverage on the day he complained.
  const HIS = [
    { topic: 'Editorial Reading', section: 'VARC' as const, status: 'practicing' as const, mins: 144 },
    { topic: 'Arrangements', section: 'DILR' as const, status: 'practicing' as const, mins: 108 },
    { topic: 'Percentages', section: 'QA' as const, status: 'learning' as const, mins: 108 },
  ];

  it('stops telling him to Learn the two topics he was already practising', () => {
    const relearned = HIS
      .map((t) => ({ ...t, label: targetPhrase(t.section, t.topic, t.mins, phaseForTopic(t.status, 'foundation')) }))
      .filter((t) => t.status === 'practicing' && t.label.startsWith('Learn '));
    expect(relearned, `still re-teaching: ${relearned.map((t) => t.label).join(' | ')}`).toHaveLength(0);
  });

  it('still says Learn for Percentages, which he really had only started', () => {
    const p = HIS[2];
    expect(targetPhrase(p.section, p.topic, p.mins, phaseForTopic(p.status, 'foundation')))
      .toMatch(/^Learn Percentages/);
  });

  it('the card can no longer say "Learn X" and "Finish what you started" together', () => {
    // "Finish what you started" is the reason shown for an already-opened
    // topic. Whenever that reason applies, the verb must not be "Learn".
    for (const status of ['practicing', 'revising', 'exam_ready'] as const) {
      const label = targetPhrase('VARC', 'Editorial Reading', 144, phaseForTopic(status, 'foundation'));
      expect(label, `${status} produced "${label}"`).not.toMatch(/^Learn /);
    }
  });
});
