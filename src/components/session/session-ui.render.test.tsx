import { describe, it, expect, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { IntentPicker, intentIsComplete } from './intent-picker';
import { SessionFeedbackCard } from './session-feedback-card';
import { SESSION_INTENTS, INTENT_LABEL, PRODUCT_FINDINGS } from '@/lib/session-intent';
import { RESOLUTIONS, RESOLUTION_LABEL, USEFULNESS, USEFULNESS_LABEL,
  BOOK_AGAIN, BOOK_AGAIN_LABEL, MAX_RATING } from '@/lib/session-feedback';

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: () => {} }) }));

// The C0 lesson: a screen that has never been rendered is unverified. These
// two are the entire Track B / Track D student surface — if either throws, the
// reason for purchase and the verdict on delivery are both lost.

const noop = () => {};

describe('the intent picker asks a real question', () => {
  const html = renderToStaticMarkup(
    <IntentPicker value={null} note="" onChange={noop} />);

  it('offers every student-selectable intent', () => {
    for (const k of SESSION_INTENTS) {
      expect(html, `${k} missing from the picker`).toContain(INTENT_LABEL[k]);
    }
  });

  it('never offers a PRODUCT-only finding as a student choice', () => {
    // A student cannot claim the product's own diagnosis as their reason.
    for (const k of PRODUCT_FINDINGS) {
      expect(html, `${k} must not be selectable`).not.toContain(INTENT_LABEL[k]);
    }
  });

  it('tells the student their buddy will read it', () => {
    expect(html).toMatch(/buddy sees this before the call/i);
  });

  it('renders cleanly', () => {
    expect(html).not.toContain('[object Object]');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('NaN');
  });
});

describe('"Something else" demands an explanation', () => {
  it('the note becomes required and says so', () => {
    const html = renderToStaticMarkup(
      <IntentPicker value="other" note="" onChange={noop} />);
    expect(html).toMatch(/required/i);
    expect(html).toMatch(/needs them/i);
  });

  it('the warning clears once a real note is typed', () => {
    const html = renderToStaticMarkup(
      <IntentPicker value="other" note="coaching moved to mornings" onChange={noop} />);
    expect(html).not.toMatch(/needs them/i);
  });

  it('the note stays optional for every other intent', () => {
    const html = renderToStaticMarkup(
      <IntentPicker value="qa_weak" note="" onChange={noop} />);
    expect(html).toMatch(/optional/i);
  });

  it('completeness mirrors the server rule exactly', () => {
    expect(intentIsComplete(null, '')).toBe(false);
    expect(intentIsComplete('other', '')).toBe(false);
    expect(intentIsComplete('other', 'ab')).toBe(false);
    expect(intentIsComplete('other', 'abc')).toBe(true);
    expect(intentIsComplete('qa_weak', '')).toBe(true);
  });

  it('marks the chosen option for assistive tech', () => {
    const html = renderToStaticMarkup(
      <IntentPicker value="dilr_weak" note="" onChange={noop} />);
    expect(html).toMatch(/aria-pressed="true"/);
  });
});

describe('the feedback card asks three separate questions', () => {
  const html = renderToStaticMarkup(
    <SessionFeedbackCard videoSessionId="11111111-2222-3333-4444-555555555555" buddyName="Shreya" />);

  it('names the buddy', () => {
    expect(html).toMatch(/How was your session with Shreya\?/);
  });

  it('offers the full rating scale', () => {
    for (let n = 1; n <= MAX_RATING; n += 1) expect(html).toContain(`>${n}<`);
  });

  it('asks about RESOLUTION separately from the rating', () => {
    // A student can like their mentor and still leave unsolved. Collapsing the
    // two hides the only case worth acting on.
    expect(html).toMatch(/Did it solve what you booked it for\?/);
    for (const r of RESOLUTIONS) expect(html).toContain(RESOLUTION_LABEL[r]);
  });

  it('asks about USEFULNESS separately from rating and resolution', () => {
    // Three facts about one call: the person, the outcome, the hour.
    expect(html).toMatch(/How useful was the session\?/);
    for (const u of USEFULNESS) expect(html).toContain(USEFULNESS_LABEL[u]);
  });

  it('offers Yes / Maybe / No — "maybe" is a real answer', () => {
    // A boolean would have recorded a rejection from a student who was
    // simply undecided.
    expect(html).toMatch(/Would you book another session\?/);
    for (const b of BOOK_AGAIN) expect(html).toContain(BOOK_AGAIN_LABEL[b]);
  });

  it('cannot be submitted before the two required answers', () => {
    expect(html).toMatch(/disabled/);
    expect(html).toMatch(/A rating and one answer above/);
  });

  it('renders without a buddy name and without leaking anything', () => {
    const bare = renderToStaticMarkup(
      <SessionFeedbackCard videoSessionId="11111111-2222-3333-4444-555555555555" buddyName={null} />);
    expect(bare).toMatch(/How was your session\?/);
    expect(bare).not.toContain('undefined');
    expect(bare).not.toContain('null');
    expect(bare).not.toContain('[object Object]');
  });
});
