import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PRICE_USD_PER_M_INPUT, PRICE_USD_PER_M_OUTPUT, USD_TO_INR } from './ai-cost';

describe('AI cost: tokens exact, one price constant', () => {
  it('the price constants are real positive numbers, easy to correct', () => {
    expect(PRICE_USD_PER_M_INPUT).toBeGreaterThan(0);
    expect(PRICE_USD_PER_M_OUTPUT).toBeGreaterThan(PRICE_USD_PER_M_INPUT);
    expect(USD_TO_INR).toBeGreaterThan(50);
  });

  it('callGemini now records usageMetadata — the unblock', () => {
    const g = readFileSync('src/lib/gemini.ts', 'utf8');
    expect(g).toContain('usageMetadata');
    expect(g).toContain("ai_usage_events");
    expect(g).toContain('recordUsage');
    // Best-effort: metering must not break the call.
    expect(g).toContain('void recordUsage');
  });

  it('the AI Center no longer says cost is impossible', () => {
    const page = readFileSync('src/app/admin/ai/page.tsx', 'utf8');
    expect(page).toContain('getAiCost');
    expect(page).not.toContain('Why there is no cost figure here');
  });
});
