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

import { callGemini, extractJson } from './gemini';

export type SafetyVerdict = 'ok' | 'blocked' | 'manual';

// Contact details and promotion are the highest-frequency real-world abuse in
// study communities (Telegram/WhatsApp funnels, coaching ads). Caught locally
// — no AI needed, no AI outage can let them through.
const CONTACT_OR_PROMO = [
  /\b\d{10}\b/,                      // bare 10-digit phone
  /\+91[\s-]?\d{5}/,                 // +91 numbers
  /wa\.me|whats\s*app/i,
  /t\.me|telegram/i,
  /insta(gram)?\b|@[a-z0-9_.]{3,}/i, // handles
  /https?:\/\/|www\./i,              // links of any kind
  /join\s+(my|our)\b/i,
  /\b(fees?|discount|admission|enroll|coaching\s+institute)\b/i,
];

export function localTextScreen(text: string): SafetyVerdict {
  for (const re of CONTACT_OR_PROMO) if (re.test(text)) return 'blocked';
  return 'ok';
}

const TEXT_SYSTEM = `You are a strict safety screen for a CAT-exam-prep study app for students.
Judge ONLY safety and relevance, never educational quality.
Return JSON: {"safe": boolean, "reason": string}.
safe=false if the text contains ANY of: sexual content, nudity references, hate speech, harassment, threats, self-harm content, violence, drug promotion, spam, advertising, requests to contact outside the app, personal contact details, or content unrelated to CAT preparation (QA/VARC/DILR study).
Otherwise safe=true. When in doubt, safe=false.`;

export async function checkTipSafety(text: string): Promise<{ verdict: SafetyVerdict; reason?: string }> {
  if (localTextScreen(text) === 'blocked') return { verdict: 'blocked', reason: 'contact/promo pattern' };

  const raw = await callGemini({
    parts: [{ text: `Screen this study tip:\n\n${text}` }],
    system: TEXT_SYSTEM, json: true, maxTokens: 150, temperature: 0,
  });
  const parsed = extractJson<{ safe?: boolean; reason?: string }>(raw);
  if (parsed == null || typeof parsed.safe !== 'boolean') return { verdict: 'manual' };
  return parsed.safe ? { verdict: 'ok' } : { verdict: 'blocked', reason: parsed.reason };
}

const IMAGE_SYSTEM = `You are a strict safety screen for images uploaded to a CAT-exam-prep study app.
An acceptable image is a photo or screenshot of an academic practice question (maths, logic, data interpretation, or English) — from a book, worksheet, screen, or handwriting.
Return JSON: {"safe": boolean, "isQuestion": boolean, "reason": string}.
safe=false for ANY of: sexual/explicit content, nudity, violence or gore, hate symbols, harassment, drug content, memes, selfies or photos of people, advertisements, QR codes, phone numbers or handles or links visible, coaching-institute promotion.
isQuestion=false if the image is not an academic question at all.
When in doubt, safe=false.`;

export async function checkImageSafety(base64: string, mimeType: string): Promise<{ verdict: SafetyVerdict; reason?: string }> {
  const raw = await callGemini({
    parts: [
      { text: 'Screen this uploaded image:' },
      { inlineData: { mimeType, data: base64 } },
    ],
    system: IMAGE_SYSTEM, json: true, maxTokens: 150, temperature: 0,
  });
  const parsed = extractJson<{ safe?: boolean; isQuestion?: boolean; reason?: string }>(raw);
  // Fail closed: no AI available → a human looks before anyone else does.
  if (parsed == null || typeof parsed.safe !== 'boolean') return { verdict: 'manual' };
  if (!parsed.safe) return { verdict: 'blocked', reason: parsed.reason };
  if (parsed.isQuestion !== true) return { verdict: 'blocked', reason: 'not an academic question image' };
  return { verdict: 'ok' };
}
