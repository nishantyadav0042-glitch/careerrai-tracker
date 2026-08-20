import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { validateSubmission } from './community-pipeline';

// ── The student says the thing; the system files it ────────────────────────
//
// Founder, 20 Aug: a student must never be shown a form — no section, no
// topic, no category, no name, no profile. The share sheet used to open with three
// classification decisions standing between a student and the thought they
// came to share: a tip/question toggle, a Section dropdown, a Topic dropdown.
// Someone with a hard question in front of them was being asked to file it
// before they could say it.
//
// All three moved behind the screen. A photo is a question. For text, the
// safety screen that already reads every submission returns the kind AND the
// section on the same Gemini call — no second classifier, no extra latency.

const SHEET = 'src/components/community-submit.tsx';
const read = (p: string) => readFileSync(p, 'utf8');
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

describe('the share sheet asks for content and nothing else', () => {
  it('has no dropdowns at all', () => {
    const s = code(SHEET);
    expect(s, 'a <select> is a form; there should be none').not.toContain('<select');
    expect(s).not.toContain('KNOWLEDGE_GRAPH');
    expect(s).not.toContain('TOPIC_METADATA');
  });

  it('does not make the student choose tip or question', () => {
    const s = code(SHEET);
    expect(s).not.toContain('setKind');
    expect(s).not.toMatch(/A tip|A question/);
  });

  it('sends only what the student actually produced', () => {
    const s = code(SHEET);
    const body = s.slice(s.indexOf('const body ='), s.indexOf('const res = await fetch'));
    for (const field of ['section', 'topic', 'kind']) {
      expect(body, `${field} must not be posted — the server works it out`).not.toContain(field);
    }
  });

  it('the send button is gated on content alone', () => {
    const s = code(SHEET);
    const ready = s.slice(s.indexOf('const ready ='), s.indexOf('async function submit'));
    expect(ready).toContain('image != null');
    expect(ready).toContain('questionText');
    for (const gate of ['section', 'topic', 'kind']) {
      expect(ready, `${gate} must not gate Send`).not.toContain(gate);
    }
  });
});

describe('the server settles what the student did not say', () => {
  const v = (b: Parameters<typeof validateSubmission>[0]) =>
    validateSubmission(b, ['QA', 'VARC', 'DILR'], (t) => (t === 'Quadratic Equations' ? 'QA' : undefined));

  it('a photo is a question even when the client claims otherwise', () => {
    const r = v({ kind: 'tip', image: 'B64', image_mime: 'image/jpeg' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value.kind).toBe('question');
  });

  it('text alone is accepted with no hint whatsoever', () => {
    const r = v({ text: 'Mark the fixed positions before anything else.' } as never);
    expect(r.ok).toBe(true);
  });

  it('kind, section and topic are all inferable — none can fail a submission', () => {
    const r = v({ text: 'Mark the fixed positions before anything else.' } as never);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.section).toBeNull();
      expect(r.value.topic).toBeNull();
    }
  });

  it('the safety screen returns kind and section on the SAME call', () => {
    const safety = read('src/lib/community-safety.ts');
    expect(safety).toContain('InferredKind');
    expect(safety).toContain('InferredSection');
    // Two calls total: one text screen, one image screen. A third would mean
    // a separate classification engine.
    expect((safety.match(/callGemini\(/g) ?? []).length).toBe(2);
  });

  it('the submit route prefers the photo, then the screen, then the hint', () => {
    const route = code('src/app/api/community/submit/route.ts');
    expect(route).toContain("sub.image ? 'question' : (textVerdict?.kind ?? sub.kind)");
  });
});
