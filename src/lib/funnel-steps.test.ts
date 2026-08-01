import { describe, it, expect } from 'vitest';
import { START_STEP_KEYS, ACCEPTED_FUNNEL_STEPS } from './funnel-steps';

// This file exists because of a silent, 14-day data loss.
//
// The /start wizard fired `start:<key>` for every screen. api/funnel/route.ts
// held a SEPARATE hand-written allowlist and dropped anything missing from it
// — returning `{ ok: true }`, so the client saw success and nothing was ever
// logged. When 'instant-insight' and 'reality-check' were added to the funnel,
// nobody updated the allowlist.
//
// Production showed it exactly: topic-coverage and mentor firing normally on
// the same days, with ZERO rows for instant-insight, the screen between them —
// the pre-signup diagnosis the product's whole pitch rests on, unmeasured
// since it shipped.
//
// The invariant below is the one that was missing. It is cheap, and it fails
// loudly the moment the two lists disagree again.

describe('every screen the funnel fires is accepted by the beacon route', () => {
  it('accepts all of START_STEP_KEYS — the bug that lost Instant Insight', () => {
    for (const key of START_STEP_KEYS) {
      expect(
        ACCEPTED_FUNNEL_STEPS.has(`start:${key}`),
        `start:${key} is fired by /start but the beacon route would DROP it silently`,
      ).toBe(true);
    }
  });

  it('accepts the two steps whose absence caused the incident', () => {
    // Named explicitly: a regression here is not a style issue, it is the
    // company's headline metric going dark again without any error.
    expect(ACCEPTED_FUNNEL_STEPS.has('start:instant-insight')).toBe(true);
    expect(ACCEPTED_FUNNEL_STEPS.has('start:reality-check')).toBe(true);
  });

  it('accepts the steps fired outside the numbered flow', () => {
    // `landed` comes from the inline script before hydration; `login-build` is
    // the terminal signup screen and is deliberately not in START_STEP_KEYS.
    expect(ACCEPTED_FUNNEL_STEPS.has('start:landed')).toBe(true);
    expect(ACCEPTED_FUNNEL_STEPS.has('start:login-build')).toBe(true);
  });

  it('still accepts the retired step so historical rows stay valid', () => {
    // 'reassurance' was removed from the funnel in v4. Nothing fires it now,
    // but funnel_events holds 149 rows under that name.
    expect(ACCEPTED_FUNNEL_STEPS.has('start:reassurance')).toBe(true);
  });

  it('rejects anything not declared — the guard is still a guard', () => {
    for (const junk of ['start:made-up', 'instant-insight', 'start:', 'landed', '']) {
      expect(ACCEPTED_FUNNEL_STEPS.has(junk), `"${junk}" must not be accepted`).toBe(false);
    }
  });

  it('keeps the screen order stable — the progress bar counts on it', () => {
    // stepIdx is persisted in a localStorage draft, so reordering silently
    // resumes a returning visitor on the wrong screen.
    expect(START_STEP_KEYS[0]).toBe('need-check');
    expect(START_STEP_KEYS[START_STEP_KEYS.length - 1]).toBe('mentor');
    expect(START_STEP_KEYS.indexOf('instant-insight')).toBe(
      START_STEP_KEYS.indexOf('topic-coverage') + 1,
    );
  });
});
