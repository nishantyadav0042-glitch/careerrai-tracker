import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { START_STEP_KEYS, ACCEPTED_FUNNEL_STEPS } from './funnel-steps';

// ── "Which section costs you the most marks?" now asked pre-auth too ────────
//
// Founder, 15 Aug, pointing at the reality-check gut-check screen in the
// /start funnel: add the weakest-section question, three options, right here.
//
// This screen (screen-weakest-section.tsx) already existed — it was built
// 14 Aug for the POST-LOGIN onboarding modal, after an audit found 78 of 326
// students (24%) had no self-reported weakest section and fell through to the
// hard-coded DILR default. The /start pre-auth funnel never asked it at all:
// every signup through that funnel was in the silent 24%, unconditionally.
//
// Reused, not re-implemented — the failure mode this repo has paid for
// repeatedly this session is a second hand-rolled "QA/VARC/DILR, three
// buttons" with its own copy and its own null-handling that drifts from the
// original. One component, one set of options, one meaning for "Not sure".

const START_PAGE = 'src/app/start/page.tsx';
// MOVED, NOT WEAKENED (29 Aug). This mapping used to live inline inside
// verify-phone-otp; it is now lib/onboarding-apply, the ONE authority both
// the OTP and the Google doors call. The invariant below is unchanged —
// only its address is. Asserting it against the authority means it now
// covers BOTH doors instead of one.
const SIGNUP_ROUTE = 'src/lib/onboarding-apply.ts';

describe('the /start funnel asks the same question, with the same component', () => {
  it('weakest-section is a real step, positioned right after reality-check', () => {
    // Placement matters: it is the natural follow-through on the gut-check
    // question the student just answered ("do you know your weakest
    // topics?"), not a question in a random slot.
    const i = START_STEP_KEYS.indexOf('weakest-section');
    expect(i, 'weakest-section missing from START_STEP_KEYS').toBeGreaterThan(-1);
    expect(START_STEP_KEYS[i - 1]).toBe('reality-check');
  });

  it('the beacon route accepts it — the exact bug class that lost Instant Insight', () => {
    // funnel-steps.ts derives the allowlist FROM this list specifically so a
    // new step can never repeat the 14-day silent data loss documented there.
    expect(ACCEPTED_FUNNEL_STEPS.has('start:weakest-section')).toBe(true);
  });

  it('imports the shared component rather than re-declaring the three options', () => {
    const src = readFileSync(START_PAGE, 'utf8');
    expect(src).toContain("from '@/app/student/onboarding/screens/screen-weakest-section'");
    expect(src).toContain('<ScreenWeakestSection');
    // No second options array — VARC/DILR/QA button labels belong to the
    // shared component only.
    expect(src).not.toMatch(/label:\s*['"]VARC['"][\s\S]{0,120}label:\s*['"]DILR['"]/);
  });

  it('bumped the draft-key version — the v8 precedent this list itself documents', () => {
    // A saved draft's stepIdx is a raw array index. Inserting a step without
    // bumping the key would resume every mid-funnel visitor one screen off —
    // topic-coverage's data landing in the new step's slot, or the reverse.
    const src = readFileSync(START_PAGE, 'utf8');
    expect(src).toMatch(/cr_preauth_draft_v(9|1\d)/);
  });
});

describe('the pre-auth signup route persists the answer, "Not sure" included', () => {
  it('is keyed on the PRESENCE of the field, not its truthiness', () => {
    // "Not sure yet" is a real, honest answer that submits null. A truthiness
    // check (`if (onboarding.self_reported_weakest_section)`) would silently
    // drop that null and leave the student on the DILR default the whole
    // feature exists to replace — the exact bug the post-login modal's own
    // comment warns about for this same field.
    const src = readFileSync(SIGNUP_ROUTE, 'utf8');
    expect(src).toContain("'self_reported_weakest_section' in onboarding");
    expect(src).not.toMatch(/if\s*\(\s*onboarding\.self_reported_weakest_section\s*\)/);
  });

  it('only ever writes VARC, DILR, QA or null — never an untrusted client string', () => {
    const src = readFileSync(SIGNUP_ROUTE, 'utf8');
    const block = src.slice(src.indexOf("'self_reported_weakest_section' in onboarding") - 40);
    const snippet = block.slice(0, block.indexOf('const subscription'));
    expect(snippet).toContain("'VARC'");
    expect(snippet).toContain("'DILR'");
    expect(snippet).toContain("'QA'");
    expect(snippet).toContain(': null');
  });
});
