// LIVE-FIRE harness — the debugging loop that found the MAX_TOKENS truncation.
//
// Runs the EXACT production pipeline (workbook -> window -> prompt -> Gemini ->
// salvage -> sanitize) against the real file that failed in production, hitting
// the real API. Skipped unless GEMINI_LIVE_KEY is set, so CI never needs the
// key and never burns quota — but the next "that doesn't look like a timetable"
// report is one env var away from a full reproduction.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { workbookToSheets, sheetsToPromptText, windowDatedSheets } from '@/lib/workbook-text';
import { spreadsheetPrompt, salvageTruncatedJson } from '@/lib/timetable-extract';
import { sanitizeBlocks, sanitizeTargets } from '@/lib/timetable';

const KEY = process.env.GEMINI_LIVE_KEY ?? '';
const FILE = new URL('./__fixtures__/buddy-weekly-plan.xlsx', import.meta.url).pathname;

describe.skipIf(!KEY)('live fire: the real file through the real model', () => {
  it('extracts blocks and targets from Shreya\'s plan', { timeout: 60_000 }, async () => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const sheets = windowDatedSheets(await workbookToSheets(readFileSync(FILE)), todayIso);
    const prompt = `${spreadsheetPrompt(todayIso)}\n\nWORKBOOK CONTENT:\n\n${sheetsToPromptText(sheets)}`;
    console.log(`PROMPT CHARS: ${prompt.length}, SHEETS: ${sheets.map((s) => `${s.name}(${s.rows})`).join(', ')}`);

    let res!: Response;
    for (let attempt = 0; attempt < 5; attempt++) {
      res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': KEY },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 8192, responseMimeType: 'application/json' },
        }),
      });
      console.log('HTTP', res.status, 'attempt', attempt + 1);
      if (res.status !== 429 && res.status < 500) break;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
    const data = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] }, finishReason?: string }[]; error?: unknown };
    if (data.error) console.log('API ERROR:', JSON.stringify(data.error).slice(0, 400));
    const cand = data.candidates?.[0];
    console.log('FINISH REASON:', cand?.finishReason);
    const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
    console.log('RAW LENGTH:', text.length);
    console.log('RAW HEAD:', text.slice(0, 600));
    console.log('RAW TAIL:', text.slice(-200));

    let parsed: { is_timetable?: boolean; blocks?: unknown; targets?: unknown } | null = null;
    try { parsed = JSON.parse(text); } catch { console.log('straight parse failed -> salvage'); parsed = salvageTruncatedJson(text); }
    console.log('is_timetable:', parsed?.is_timetable);
    const blocks = sanitizeBlocks(parsed?.blocks);
    const targets = sanitizeTargets(parsed?.targets);
    console.log(`SANITIZED: ${blocks.length} blocks, ${targets.length} targets`);
    console.log('FIRST BLOCKS:', JSON.stringify(blocks.slice(0, 6), null, 1));
    console.log('TARGETS:', JSON.stringify(targets.slice(0, 8), null, 1));

    expect(parsed?.is_timetable).toBe(true);
    expect(blocks.length).toBeGreaterThan(0);
  });
});
