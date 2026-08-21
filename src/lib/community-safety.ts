// ── The one automated gate: safety, not quality ─────────────────────────────
//
// Educational quality is decided by student votes — the system does not judge
// it. Safety is different: a single explicit image or a coaching ad reaching
// even one student before the community can react is unacceptable, so EVERY
// submission passes this gate before anyone sees it. Founder's exact bar:
// "really really strict for sure."
//
// Fail-closed by design: if the AI check can't run (no key, outage), the
// submission goes to MANUAL review — it is never published unchecked. This
// respects the gemini.ts constitution: the AI here screens for safety and
// relevance (organizing/filtering), it never judges whether the maths is
// good — students do that with votes.

// SECTION INFERENCE (20 Aug) rides along on these SAME calls. The founder's
// rule: internal structure must not become student friction — a student with
// a tough question in front of them should not have to classify it into our
// taxonomy first. The safety screen is already reading the content, so it
// returns the section too: zero extra API calls, zero extra latency, and no
// second classification engine anywhere in the codebase.
import { callGemini, extractJson } from './gemini';

export type SafetyVerdict = 'ok' | 'blocked' | 'manual';

// Contact details and promotion are the highest-frequency real-world abuse in
// study communities (Telegram/WhatsApp funnels, coaching ads). Caught locally
// — no AI needed, no AI outage can let them through.
// FIXED 21 Aug (hardening sprint): this list used to hard-block the words
// "fees", "discount", "admission", "enroll" and any bare 10-digit number —
// which are the vocabulary of CAT ARITHMETIC. "A shopkeeper offers a 20%
// discount…" is a profit-and-loss staple, and number-theory questions carry
// long digit strings. A student sharing a legitimate question was told to
// "keep it about CAT prep" — a correct submission accused of being spam,
// before Gemini ever saw it. The local screen now blocks only unambiguous
// contact/funnel patterns; commercial promotion in *sentence* form is
// Gemini's job, which reads meaning instead of matching characters.
const CONTACT_OR_PROMO = [
  /\+91[\s-]?\d{5}/,                 // +91 numbers — contact, never arithmetic
  /\b[6-9]\d{4}[\s-]\d{5}\b/,       // 98765 43210 spaced mobile shape
  /wa\.me|whats\s*app/i,
  /t\.me|telegram/i,
  /insta(gram)?\b|@[a-z0-9_.]{3,}/i, // handles
  /https?:\/\/|www\./i,              // links of any kind
  /join\s+(my|our)\b/i,
  /\bcoaching\s+institute\b/i,       // the one commercial phrase with no maths reading
  /\b(call|dm|message)\s+me\b/i,
];

export function localTextScreen(text: string): SafetyVerdict {
  for (const re of CONTACT_OR_PROMO) if (re.test(text)) return 'blocked';
  return 'ok';
}

const TEXT_SYSTEM = `You are a strict safety screen for a CAT-exam-prep study app for students.
Judge ONLY safety and relevance, never educational quality.
Return JSON: {"safe": boolean, "reason": string}.
safe=false if the text contains ANY of: sexual content, nudity references, hate speech, harassment, threats, self-harm content, violence, drug promotion, spam, advertising, requests to contact outside the app, personal contact details, or content unrelated to CAT preparation (QA/VARC/DILR study).
NOTE: exam questions legitimately mention money, fees, discounts, percentages and phone-number-length numbers — that is arithmetic, not advertising. Judge intent, not vocabulary.
Otherwise safe=true. When in doubt, safe=false.
Also return "kind": "question" if the text is a problem to solve or a doubt to resolve, "tip" if it is advice/strategy, or null if unclear.
Also return "section": one of "QA", "VARC", "DILR", or null if you cannot tell confidently.`;

/** The three CAT sections, or null when the screen could not tell. */
export type InferredSection = 'QA' | 'VARC' | 'DILR' | null;

function readSection(v: unknown): InferredSection {
  return v === 'QA' || v === 'VARC' || v === 'DILR' ? v : null;
}

/** Is this a problem to solve, or advice? Null when the screen cannot tell. */
export type InferredKind = 'question' | 'tip' | null;

function readKind(v: unknown): InferredKind {
  return v === 'question' || v === 'tip' ? v : null;
}

export async function checkTipSafety(text: string): Promise<{ verdict: SafetyVerdict; reason?: string; section?: InferredSection; kind?: InferredKind }> {
  if (localTextScreen(text) === 'blocked') return { verdict: 'blocked', reason: 'contact/promo pattern' };

  const raw = await callGemini({
    parts: [{ text: `Screen this study tip:\n\n${text}` }],
    system: TEXT_SYSTEM, json: true, maxTokens: 150, temperature: 0,
    timeoutMs: 8_000, maxRetries: 1, // student-facing: bounded, never a 40s wait
  });
  const parsed = extractJson<{ safe?: boolean; reason?: string; section?: unknown; kind?: unknown }>(raw);
  if (parsed == null || typeof parsed.safe !== 'boolean') return { verdict: 'manual' };
  return parsed.safe
    ? { verdict: 'ok', section: readSection(parsed.section), kind: readKind(parsed.kind) }
    : { verdict: 'blocked', reason: parsed.reason };
}

const IMAGE_SYSTEM = `You are a strict safety screen for images uploaded to a CAT-exam-prep study app.
An acceptable image is a photo or screenshot of academic study content (maths, logic, data interpretation, or English) — from a book, worksheet, screen, or handwriting.
Return JSON: {"safe": boolean, "isQuestion": boolean, "coherence": string, "quality": string, "reason": string}.
safe=false for ANY of: sexual/explicit content, nudity, violence or gore, hate symbols, harassment, drug content, memes, selfies or photos of people, advertisements, QR codes, phone numbers or handles or links visible, coaching-institute promotion.
isQuestion=false ONLY if the image contains no academic study content at all.
"coherence": "coherent" when the image is ONE connected piece of learning content — a single question, a multi-part question, a passage with its sub-questions, or one DI set with several numbered parts all count as coherent. "multiple" ONLY when the image contains several clearly UNRELATED questions or mixed screen regions (e.g. a full book page of independent questions, or app UI around the content). "unclear" if you cannot tell.
"quality": "usable" normally; "blurry" if the text cannot be read; "too_small" if the content is a tiny fraction of the frame; "blank" if there is essentially nothing there.
When in doubt about SAFETY, safe=false. When in doubt about coherence or quality, prefer "coherent" and "usable" — these fields guide the student, they do not censor.
Also return "section": one of "QA", "VARC", "DILR", or null if you cannot tell confidently.`;

/** How the image hangs together, per the screen. The primitive is ONE
 *  COHERENT LEARNING OBJECT — a DI set with Q1/Q2/Q3 is coherent; a full
 *  page of unrelated questions is 'multiple'. */
export type ImageCoherence = 'coherent' | 'multiple' | 'unclear';
export type ImageQuality = 'usable' | 'blurry' | 'too_small' | 'blank';

function readCoherence(v: unknown): ImageCoherence {
  return v === 'multiple' || v === 'unclear' ? v : 'coherent';
}
function readQuality(v: unknown): ImageQuality {
  return v === 'blurry' || v === 'too_small' || v === 'blank' ? v : 'usable';
}

export async function checkImageSafety(base64: string, mimeType: string): Promise<{
  verdict: SafetyVerdict; reason?: string; section?: InferredSection;
  coherence?: ImageCoherence; quality?: ImageQuality;
}> {
  const raw = await callGemini({
    parts: [
      { text: 'Screen this uploaded image:' },
      { inlineData: { mimeType, data: base64 } },
    ],
    system: IMAGE_SYSTEM, json: true, maxTokens: 200, temperature: 0,
    // 21 Aug: the first real submission spent ~38s here — no timeout, four
    // attempts, ~1 MB re-sent each time. A student is watching this request:
    // bound each attempt and stop after ONE retry; fail-closed 'manual'
    // (held for review) is a better outcome than a 40-second spinner.
    timeoutMs: 12_000, maxRetries: 1,
  });
  const parsed = extractJson<{ safe?: boolean; isQuestion?: boolean; reason?: string; section?: unknown; coherence?: unknown; quality?: unknown }>(raw);
  // Fail closed: no AI available → a human looks before anyone else does.
  if (parsed == null || typeof parsed.safe !== 'boolean') return { verdict: 'manual' };
  if (!parsed.safe) return { verdict: 'blocked', reason: parsed.reason };
  if (parsed.isQuestion !== true) return { verdict: 'blocked', reason: 'not an academic question image' };
  return {
    verdict: 'ok',
    section: readSection(parsed.section),
    coherence: readCoherence(parsed.coherence),
    quality: readQuality(parsed.quality),
  };
}
