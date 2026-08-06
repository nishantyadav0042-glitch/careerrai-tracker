// Server-side Gemini (Flash-Lite) client. The API key is read here and NEVER
// leaves the server — sent via header, never a query string, never logged.
//
// THE GOVERNING RULE (the moat): AI may SUMMARIZE, ORGANIZE, and DRAFT. AI may
// NEVER DIAGNOSE causes or RECOMMEND actions. Facts are the model's domain;
// interpretation is the buddy's — interpretation is what the student pays for.
// Every feature passes this as the system instruction.

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const DEFAULT_MODEL = 'gemini-2.5-flash-lite'; // free-tier workhorse (NOT Pro)

export const GOVERNING_RULE = `You are a backstage assistant inside CareerRai, a CAT-prep mentorship app. You work for the human mentor ("buddy"), never the student directly.

ABSOLUTE RULES — these define the product and may never be broken:
1. You may ONLY summarize, organize, extract, and draft. You state facts and arrange them.
2. You must NEVER diagnose a cause, name a "weakness type", label a concept gap, or recommend any action or study plan.
3. ALLOWED examples: "QA accuracy fell 72% to 54% across 3 mocks." "DILR flat for 4 mocks while QA rose." "Logged 4 of last 7 days."
4. FORBIDDEN examples: "The student has a conceptual weakness in arithmetic." "They should spend 2 hours on QA." "This suggests a set-selection problem." "Their fundamentals are weak."
5. When a fact invites interpretation, pose it as an open question for the mentor ("— worth exploring why"), never as a conclusion.
6. Never invent CAT facts, never teach content, never give the student advice. If asked to diagnose, recommend, or teach, refuse and restate only the facts.

The mentor draws every conclusion. You only remove friction.`;

// Module-level key cache — avoids repeated DB lookups within a function lifetime.
let _keyCache: string | null | undefined = undefined;

async function resolveKey(): Promise<string | null> {
  // 1. Try env var first (fast path).
  const envKey = process.env.GEMINI_API_KEY;
  if (envKey && envKey.length > 0) return envKey;

  // 2. Env var is missing/empty — fall back to Supabase server_config table.
  if (_keyCache !== undefined) return _keyCache;
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    );
    const { data, error } = await admin
      .from('server_config')
      .select('value')
      .eq('key', 'GEMINI_API_KEY')
      .single();
    if (!error) {
      // Only cache on a successful query. A transient DB error must not permanently
      // disable AI for the lifetime of this worker process.
      _keyCache = data?.value ?? null;
    }
  } catch {
    // Don't set _keyCache — let the next request retry.
  }
  return _keyCache ?? null;
}

export async function geminiEnabled(): Promise<boolean> {
  return !!(await resolveKey());
}

export function geminiEnabledSync(): boolean {
  return !!process.env.GEMINI_API_KEY;
}

export interface GeminiPart {
  text?: string;
  inlineData?: { mimeType: string; data: string }; // base64 image, etc.
}

interface CallOpts {
  parts: GeminiPart[];
  system?: string;
  json?: boolean;        // ask for application/json back
  maxTokens?: number;
  temperature?: number;
  model?: string;
  maxRetries?: number;
  /**
   * Backoff spacing in ms for 429/5xx. The default (400ms base) suits chat
   * drafts where a user is watching a spinner. A route with maxDuration 60
   * (timetable parse) can afford to wait out a free-tier per-minute window
   * instead — pass something like 8000 and the retries land at ~8s/16s/32s,
   * which turns "scanner is busy" into a slow success for most 429s.
   */
  backoffBaseMs?: number;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

// Returns the model's text, or null on any failure/limit — callers MUST have a
// non-AI fallback so a user never sees an AI error.
export async function callGemini(opts: CallOpts): Promise<string | null> {
  const key = await resolveKey();
  if (!key) return null;

  const model = opts.model ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
  const url = `${API_BASE}/${model}:generateContent`;
  const body = {
    ...(opts.system ? { systemInstruction: { parts: [{ text: opts.system }] } } : {}),
    contents: [{ role: 'user', parts: opts.parts }],
    generationConfig: {
      temperature: opts.temperature ?? 0.4,
      maxOutputTokens: opts.maxTokens ?? 512,
      ...(opts.json ? { responseMimeType: 'application/json' } : {}),
    },
  };

  const maxRetries = opts.maxRetries ?? 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
      });

      // Rate limit / transient server error → exponential backoff with jitter.
      if (res.status === 429 || res.status >= 500) {
        if (attempt === maxRetries) {
          console.error(`[gemini] API ${res.status} after ${attempt + 1} attempts (model=${model})`);
          return null;
        }
        await backoff(attempt, opts.backoffBaseMs);
        continue;
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        console.error(`[gemini] ${res.status} error (model=${model}):`, errText.slice(0, 300));
        return null;
      }

      const data = (await res.json()) as GeminiResponse;
      const text = data.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? '')
        .join('')
        .trim();
      return text && text.length > 0 ? text : null;
    } catch {
      if (attempt === maxRetries) return null;
      await backoff(attempt, opts.backoffBaseMs);
    }
  }
  return null;
}

function backoff(attempt: number, baseMs = 400): Promise<void> {
  const base = baseMs * 2 ** attempt;     // e.g. 400ms, 800ms, 1600ms…
  const jitter = Math.random() * 300;     // ±jitter so retries don't sync up
  return new Promise((r) => setTimeout(r, base + jitter));
}

// Tolerant JSON extraction: strips ``` fences and slices to the outermost {...}.
export function extractJson<T = unknown>(raw: string | null): T | null {
  if (!raw) return null;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

// Privacy: strip student name tokens from any text before it goes to the model
// (free-tier Gemini may train on prompts). Apply this to BOTH the input we send
// AND the output we display — input stripping is what actually protects privacy.
export function stripNames(text: string, names: (string | null | undefined)[]): string {
  let out = text;
  for (const name of names) {
    if (!name) continue;
    const trimmed = name.trim();
    if (!trimmed) continue;
    // Full name as a single unit first ("Priya Sharma" → "the student").
    out = out.replace(new RegExp(`\\b${escapeRegExp(trimmed)}\\b`, 'gi'), 'the student');
    // Then each name token (first/last) ≥ 2 chars, so short names are caught too.
    for (const token of trimmed.split(/\s+/).filter((t) => t.length >= 2)) {
      out = out.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, 'gi'), 'the student');
    }
  }
  return out;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
