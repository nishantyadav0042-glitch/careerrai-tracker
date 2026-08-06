import { describe, it, expect } from 'vitest';
import { salvageTruncatedJson, spreadsheetPrompt } from './timetable-extract';

// The truncation rescue. The failure it repairs happened live: the model hit
// MAX_TOKENS mid-array and 60 complete blocks were thrown away over two
// missing closing brackets.

describe('salvageTruncatedJson', () => {
  it('passes intact JSON straight through', () => {
    expect(salvageTruncatedJson<{ a: number }>('{"a": 1}')).toEqual({ a: 1 });
  });

  it('rescues an object truncated mid-array — the live failure shape', () => {
    const truncated = `{"is_timetable": true, "blocks": [{"date": "2026-08-06", "section": "QA"}, {"date": "2026-08-07", "sec`;
    const saved = salvageTruncatedJson<{ is_timetable: boolean; blocks: unknown[] }>(truncated);
    expect(saved?.is_timetable).toBe(true);
    expect(saved?.blocks).toHaveLength(1);   // the complete block survives
  });

  it('rescues a cut that landed inside a string value', () => {
    const truncated = `{"blocks": [{"label": "3 hrs: Functions, Progr`;
    const saved = salvageTruncatedJson<{ blocks: unknown[] }>(truncated);
    expect(saved).not.toBeNull();
    expect(saved?.blocks).toEqual([]);
  });

  it('returns null for hopeless input instead of guessing', () => {
    expect(salvageTruncatedJson('complete nonsense')).toBeNull();
    expect(salvageTruncatedJson('')).toBeNull();
  });
});

describe('the spreadsheet prompt', () => {
  it('carries the injected date and the day-plan override', () => {
    const p = spreadsheetPrompt('2026-08-06');
    expect(p).toContain('TODAY is 2026-08-06');
    expect(p).toContain('DAY-PLAN GRID');
    expect(p).toContain('is_timetable');
  });
});
