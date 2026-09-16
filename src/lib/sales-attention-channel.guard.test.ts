/**
 * ── "Opened the app and did not study" is worth a voice ────────────────────
 *
 * Founder, 15 Sep 2026: *"un sabhi students ko jaldi se jaldi call karna hai"*
 * — and, on the capacity arithmetic, *"attention ka cap kam karke"*.
 *
 * The lane was a message from 2 Sep because a question is cheap to send. What
 * changed is who it goes to: since 15 Sep it also fires for a student who
 * opened the app and recorded, in their own words, that they could not study.
 * Answering that with a template wastes the one moment they chose to tell us
 * something.
 *
 * The cost is real and is paid in the ceiling, not hidden: 107 free students
 * opened the app without studying in fifteen days, a day is 50-70 cards, and
 * two part-time counsellors work it. Both halves of that trade are pinned
 * here, because shipping the call without the smaller cap would quietly take
 * a third of every day from the `restart` students the founder had just named
 * first priority.
 */
import { describe, it, expect } from 'vitest';
import { assembleDay } from './sales-day';
import { ATTENTION_CEILING, DAY_CEILING, ROTATION_CALL_EVERY } from './os/scale-config';
import type { DueReason } from './call-queue';

let seq = 0;
const card = (dueReason: DueReason, n: number) =>
  Array.from({ length: n }, () => ({ studentId: `s${++seq}`, dueReason }));

describe('attention is a call', () => {
  it('every attention card is dealt as a call, not a template', () => {
    const day = assembleDay(card('attention', 5));
    const attention = day.queue.filter((c) => c.section === 'attention');
    expect(attention.length).toBe(5);
    expect(attention.every((c) => c.channel === 'call')).toBe(true);
  });

  it('rotation is still the messaged lane — there the volume IS the point', () => {
    const day = assembleDay(card('rotation', ROTATION_CALL_EVERY * 3));
    const rotation = day.queue.filter((c) => c.section === 'rotation');
    expect(rotation.some((c) => c.channel === 'message'), 'rotation must not become all calls').toBe(true);
  });
});

describe('and the day it costs is bounded', () => {
  it('the ceiling was halved in the same change, not left at 20', () => {
    // Shipping the call without this would have taken ~20 of 50-70 slots a
    // day from `restart` and the promises.
    expect(ATTENTION_CEILING).toBe(10);
    expect(ATTENTION_CEILING).toBeLessThan(DAY_CEILING / 4);
  });

  it('a spike spills to tomorrow instead of eating today', () => {
    const day = assembleDay([...card('attention', 40), ...card('fresh', 100)]);
    expect(day.queue.filter((c) => c.section === 'attention').length).toBe(ATTENTION_CEILING);
    expect(day.queue.length).toBeLessThanOrEqual(DAY_CEILING);
  });

  it('but a short book gets the held-back cards back, rather than a short day', () => {
    // The ceiling is a cap on how much of a FULL day this lane may take, not a
    // rule that leaves a counsellor with forty minutes of work. Held back is
    // not discarded — this is the pre-existing rule and halving the ceiling
    // must not have quietly turned it into a discard.
    const thin = assembleDay([...card('attention', 40), ...card('fresh', 30)]);
    expect(thin.queue.filter((c) => c.section === 'attention').length)
      .toBeGreaterThan(ATTENTION_CEILING);
    expect(thin.queue.every((c) => c.section !== 'attention' || c.channel === 'call'),
      'a card that comes back to fill the day is still a call').toBe(true);
  });

  it('the cards it holds back do not crowd out the rest of the day', () => {
    const day = assembleDay([...card('attention', 40), ...card('restart', 20), ...card('fresh', 20)]);
    expect(day.queue.filter((c) => c.section === 'retention').length,
      'the restart students the founder called first priority still get their slots').toBeGreaterThan(0);
  });
});
