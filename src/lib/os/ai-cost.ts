/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── AI cost, made honest ────────────────────────────────────────────────────
//
// The token counts in ai_usage_events are EXACT — Gemini returns them on every
// response. The only estimate anywhere in the cost path is the price per
// million tokens, and it lives here as one clearly-labelled constant so it can
// be corrected in one place when Google changes it, and so the UI can say
// plainly "tokens measured, ₹ at this published rate."
//
// gemini-2.5-flash-lite published rate (per 1M tokens), USD, checked Aug 2026.
// If Google moves it, change these two numbers and every cost figure in the OS
// updates. If you are unsure, over-state rather than under-state: a founder who
// budgets against a number that is too LOW gets a nasty surprise; too high is
// merely conservative.
export const PRICE_USD_PER_M_INPUT = 0.10;
export const PRICE_USD_PER_M_OUTPUT = 0.40;
export const USD_TO_INR = 84;

export interface AiCostWindow {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  totalTokens: number;
  rupees: number;
}

function rupeesFor(promptTokens: number, outputTokens: number): number {
  const usd =
    (promptTokens / 1_000_000) * PRICE_USD_PER_M_INPUT +
    (outputTokens / 1_000_000) * PRICE_USD_PER_M_OUTPUT;
  return usd * USD_TO_INR;
}

export interface AiCostReport {
  today: AiCostWindow;
  last7: AiCostWindow;
  last30: AiCostWindow;
  /** Trailing daily average over the prior 30 days (excluding today). */
  dailyAvgRupees: number;
  /** Today vs the trailing average — the anomaly signal. */
  spikeRatio: number | null;
}

const EMPTY: AiCostWindow = { calls: 0, promptTokens: 0, outputTokens: 0, totalTokens: 0, rupees: 0 };

function accumulate(rows: { prompt_tokens: number; output_tokens: number; total_tokens: number }[]): AiCostWindow {
  const w = { ...EMPTY };
  for (const r of rows) {
    w.calls++;
    w.promptTokens += r.prompt_tokens ?? 0;
    w.outputTokens += r.output_tokens ?? 0;
    w.totalTokens += r.total_tokens ?? 0;
  }
  w.rupees = rupeesFor(w.promptTokens, w.outputTokens);
  return w;
}

export async function getAiCost(admin: Admin, nowMs: number): Promise<AiCostReport> {
  const since = new Date(nowMs - 30 * 86_400_000).toISOString();
  const { data } = await admin
    .from('ai_usage_events')
    .select('prompt_tokens, output_tokens, total_tokens, created_at')
    .gte('created_at', since)
    .limit(50_000);

  const rows = data ?? [];
  const dayAgo = nowMs - 86_400_000;
  const weekAgo = nowMs - 7 * 86_400_000;

  const today = accumulate(rows.filter((r: any) => Date.parse(r.created_at) >= dayAgo));
  const last7 = accumulate(rows.filter((r: any) => Date.parse(r.created_at) >= weekAgo));
  const last30 = accumulate(rows);

  // Trailing daily average across the prior 30 days, excluding today, so a
  // spike today is measured against a normal day rather than against itself.
  const priorRows = rows.filter((r: any) => Date.parse(r.created_at) < dayAgo);
  const priorRupees = accumulate(priorRows).rupees;
  const dailyAvgRupees = priorRupees / 30;
  const spikeRatio = dailyAvgRupees > 0 ? today.rupees / dailyAvgRupees : null;

  return { today, last7, last30, dailyAvgRupees, spikeRatio };
}
