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

  // 20 Aug: section became optional too. NOTHING but the content is required
  // now — the safety screen already reads every submission and returns the
  // section, so a student never files anything into our taxonomy.
  it('no section is fine — the content is the only requirement', () => {
    const r = validate({ kind: 'question', text: 'a perfectly reasonable question here' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.section).toBeNull();
  });

  it('a section the student DID pick is kept', () => {
    const r = validate({ kind: 'question', section: 'QA', text: 'a perfectly reasonable question here' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.section).toBe('QA');
  });

  it('a nonsense section is dropped, not rejected', () => {
    const r = validate({ kind: 'question', section: 'ASTROLOGY', text: 'a perfectly reasonable question here' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.section).toBeNull();
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

  // 20 Aug: topic became OPTIONAL for tips. It used to be mandatory, which
  // put the heaviest form on the lightest contribution — a photo question
  // needed only a section, a one-line tip needed the exact topic hunted out
  // of a dropdown. The student brings the idea; the system files it.
  it('a tip without a topic is accepted', () => {
    const r = validate({ kind: 'tip', section: 'QA', tip: 'Always factor before you reach for the formula.' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.topic).toBeNull();
  });

  it('a topic from the WRONG section is dropped, not rejected — no cross-filing, no dead end', () => {
    const r = validate({ kind: 'tip', section: 'QA', topic: 'Reading Comprehension', tip: 'Skim the passage twice before the questions.' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.topic).toBeNull();
  });

  it('a correct topic still files the tip under it', () => {
    const r = validate({ kind: 'tip', section: 'QA', topic: 'Quadratic Equations', tip: 'Always factor before you reach for the formula.' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.topic).toBe('Quadratic Equations');
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

describe('classification never becomes student friction', () => {
  it('the safety screen returns the section — no second classifier exists', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const safety = readFileSync('src/lib/community-safety.ts', 'utf8');
    // It rides the SAME Gemini call the screen already makes: no extra
    // request, no extra latency, and nowhere else in the codebase decides
    // what section a piece of student content belongs to.
    expect(safety).toContain('InferredSection');
    expect(safety).toContain('readSection');
    const calls = (safety.match(/callGemini\(/g) ?? []).length;
    expect(calls, 'a separate classification call would be a second engine').toBe(2);
  });

  it('the submit route prefers the student choice, then the inference', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const route = readFileSync('src/app/api/community/submit/route.ts', 'utf8');
    expect(route).toContain('sub.section ?? imageVerdict?.section ?? textVerdict?.section ?? null');
  });

  it('the client requires content and nothing else', () => {
    const { readFileSync } = require('node:fs') as typeof import('node:fs');
    const client = readFileSync('src/components/community-submit.tsx', 'utf8');
    const ready = client.slice(client.indexOf('const ready ='), client.indexOf('async function submit'));
    expect(ready, 'section must not gate the send button').not.toContain('section &&');
    expect(ready, 'topic must not gate it either').not.toContain('topic &&');
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
