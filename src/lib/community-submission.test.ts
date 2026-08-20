import { describe, it, expect } from 'vitest';
import { validateSubmission, MAX_QUESTION_CHARS, MIN_TIP_CHARS } from './community-pipeline';

// ── The submission contract, as a pure function ────────────────────────────
//
// 19 Aug: a real student's question attempt died as an opaque 400 — the only
// real contribution attempt in the product's life, unexplainable from our
// own telemetry. The contract now lives in ONE pure function with a machine
// code on every rejection, and these tests pin the founder ruling (20 Aug):
// a question needs text OR a photo — never a mandatory image.

const SECTIONS = ['QA', 'VARC', 'DILR'] as const;
const topicSection = (t: string) =>
  ({ 'Quadratic Equations': 'QA', 'Reading Comprehension': 'VARC' }[t]);

const validate = (body: Record<string, unknown>) =>
  validateSubmission(body, SECTIONS, topicSection);

describe('a question is text OR image — either alone is enough', () => {
  it('typed question, no image: accepted', () => {
    const r = validate({ kind: 'question', section: 'QA', text: 'If x²−5x+6=0 and x>2, what is x³?' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.text).toContain('x²'); expect(r.value.image).toBeNull(); }
  });

  it('photo question, no text: accepted', () => {
    const r = validate({ kind: 'question', section: 'QA', image: 'aGVsbG8=', image_mime: 'image/jpeg' });
    expect(r.ok).toBe(true);
  });

  it('both together: accepted, both kept', () => {
    const r = validate({ kind: 'question', section: 'QA', text: 'See attached — why is option B wrong here?', image: 'aGVsbG8=', image_mime: 'image/jpeg' });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.value.text).not.toBeNull(); expect(r.value.image).not.toBeNull(); }
  });

  it('neither: rejected with CONTENT_REQUIRED, and the message offers both paths', () => {
    const r = validate({ kind: 'question', section: 'QA' });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('CONTENT_REQUIRED'); expect(r.error).toMatch(/type|photo/i); }
  });
});

describe('every rejection carries a machine code — no more opaque 400s', () => {
  it('unsupported image mime → IMAGE_TYPE_UNSUPPORTED with a helpful sentence', () => {
    const r = validate({ kind: 'question', section: 'QA', image: 'aGVsbG8=', image_mime: 'image/heic' });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.code).toBe('IMAGE_TYPE_UNSUPPORTED'); expect(r.error).toMatch(/JPG|PNG/); }
  });

  it('missing section → SECTION_REQUIRED', () => {
    const r = validate({ kind: 'question', text: 'a perfectly reasonable question here' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('SECTION_REQUIRED');
  });

  it('bad kind → KIND_INVALID', () => {
    const r = validate({ kind: 'rant', section: 'QA' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('KIND_INVALID');
  });

  it('over-long typed question → TEXT_TOO_LONG at the declared cap', () => {
    const r = validate({ kind: 'question', section: 'QA', text: 'x'.repeat(MAX_QUESTION_CHARS + 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TEXT_TOO_LONG');
  });
});

describe('tips keep their existing contract', () => {
  it('a good tip passes with its topic', () => {
    const r = validate({ kind: 'tip', section: 'QA', topic: 'Quadratic Equations', tip: 'Always factor before you reach for the formula.' });
    expect(r.ok).toBe(true);
  });

  it('tip without topic → TOPIC_REQUIRED', () => {
    const r = validate({ kind: 'tip', section: 'QA', tip: 'Always factor before you reach for the formula.' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TOPIC_REQUIRED');
  });

  it('topic from the WRONG section → TOPIC_REQUIRED (no cross-filing)', () => {
    const r = validate({ kind: 'tip', section: 'QA', topic: 'Reading Comprehension', tip: 'Skim the passage twice before the questions.' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TOPIC_REQUIRED');
  });

  it('short tip → TEXT_TOO_SHORT below the declared floor', () => {
    const r = validate({ kind: 'tip', section: 'QA', topic: 'Quadratic Equations', tip: 'x'.repeat(MIN_TIP_CHARS - 1) });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.code).toBe('TEXT_TOO_SHORT');
  });

  it('question topic is optional and silently dropped when invalid', () => {
    const r = validate({ kind: 'question', section: 'QA', topic: 'Not A Topic', text: 'What is the remainder when 7^100 is divided by 5?' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.topic).toBeNull();
  });
});

describe('the route and the client both speak this contract', () => {
  it('the route validates through validateSubmission, not inline checks', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const route = readFileSync('src/app/api/community/submit/route.ts', 'utf8');
    expect(route).toContain('validateSubmission(');
    expect(route).toMatch(/code: v\.code/);
    // Every failure response carries a code.
    const codeless = [...route.matchAll(/NextResponse\.json\(\{ error:[^}]*\}/g)]
      .filter((m) => !m[0].includes('code:'));
    expect(codeless, `failure responses without a code: ${codeless.map((m) => m[0]).join(' | ')}`).toHaveLength(0);
  });

  it('the client re-encodes photos to JPEG — the HEIC wall is gone', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const client = readFileSync('src/components/community-submit.tsx', 'utf8');
    expect(client).toContain('createImageBitmap');
    expect(client).toContain("toDataURL('image/jpeg'");
    expect(client).toContain("track('community_share_opened'");
  });
});
