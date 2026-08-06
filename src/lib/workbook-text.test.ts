import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import {
  workbookToSheets, csvToSheet, sheetsToPromptText,
  MAX_SHEETS, MAX_ROWS_PER_SHEET, MAX_TOTAL_CHARS,
} from './workbook-text';

// Excel → text for the timetable extractor. Founder, 6 Aug: "students will
// send excel files only mostly." These tests build real workbooks in memory
// and assert the text the model will actually see — because the failure mode
// here is silent: a time cell rendered as "0.75" doesn't error, it just makes
// the extractor hallucinate a schedule.

async function build(fill: (wb: ExcelJS.Workbook) => void): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  fill(wb);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('a real coaching workbook, daily sheet + weekly sheet', () => {
  it('keeps every sheet, labeled by its own tab name', async () => {
    const buf = await build((wb) => {
      const daily = wb.addWorksheet('Daily Plan');
      daily.addRow(['Day 1', 'Percentages', '2 hrs']);
      daily.addRow(['Day 2', 'Time Speed Distance', '2 hrs']);
      const weekly = wb.addWorksheet('Weekly Schedule');
      weekly.addRow(['Monday', '6 PM - 8 PM', 'Arithmetic']);
      weekly.addRow(['Wednesday', '6 PM - 8 PM', 'Reading Comprehension']);
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets.map((s) => s.name)).toEqual(['Daily Plan', 'Weekly Schedule']);
    expect(sheets[0].text).toContain('Day 1 | Percentages | 2 hrs');
    expect(sheets[1].text).toContain('Monday | 6 PM - 8 PM | Arithmetic');

    const prompt = sheetsToPromptText(sheets);
    expect(prompt).toContain('=== SHEET: "Daily Plan" ===');
    expect(prompt).toContain('=== SHEET: "Weekly Schedule" ===');
  });
});

describe('Excel cell quirks are rendered faithfully', () => {
  it('renders a time cell as HH:MM, never as a day-fraction', async () => {
    // Excel stores "6:00 PM" as 0.75 of a day anchored to 30 Dec 1899. The
    // student's coaching typed a time; the model must see a time.
    const buf = await build((wb) => {
      const ws = wb.addWorksheet('Times');
      ws.addRow(['Monday', new Date(Date.UTC(1899, 11, 30, 18, 0)), 'Algebra']);
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets[0].text).toContain('18:00');
    expect(sheets[0].text).not.toContain('1899');
    expect(sheets[0].text).not.toContain('0.75');
  });

  it('renders a date cell as yyyy-mm-dd', async () => {
    const buf = await build((wb) => {
      const ws = wb.addWorksheet('Dated');
      ws.addRow([new Date(Date.UTC(2026, 8, 26)), 'Tuesday', 'Geometry Basics 1']);
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets[0].text).toContain('2026-09-26');
    expect(sheets[0].text).not.toContain('00:00');
  });

  it('renders a formula cell by its result, not its formula', async () => {
    const buf = await build((wb) => {
      const ws = wb.addWorksheet('F');
      ws.addRow(['Total sets']);
      ws.getCell('B1').value = { formula: 'SUM(1,1)', result: 200 } as ExcelJS.CellValue;
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets[0].text).toContain('200');
    expect(sheets[0].text).not.toContain('SUM');
  });

  it('renders rich text as its plain words', async () => {
    const buf = await build((wb) => {
      const ws = wb.addWorksheet('R');
      ws.getCell('A1').value = {
        richText: [{ text: 'Complete ' }, { text: '200 LRDI sets', font: { bold: true } }],
      } as ExcelJS.CellValue;
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets[0].text).toContain('Complete 200 LRDI sets');
  });

  it('drops empty rows and skips empty sheets entirely', async () => {
    const buf = await build((wb) => {
      wb.addWorksheet('Empty');
      const ws = wb.addWorksheet('Real');
      ws.addRow([]);
      ws.addRow(['Monday', 'Arithmetic']);
      ws.addRow([]);
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets).toHaveLength(1);
    expect(sheets[0].name).toBe('Real');
    expect(sheets[0].rows).toBe(1);
  });

  it('skips hidden sheets — a plan is never built from rows the student cannot see', async () => {
    const buf = await build((wb) => {
      const hidden = wb.addWorksheet('Internal');
      hidden.addRow(['secret', 'rows']);
      hidden.state = 'hidden';
      const ws = wb.addWorksheet('Timetable');
      ws.addRow(['Monday', 'Arithmetic']);
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets.map((s) => s.name)).toEqual(['Timetable']);
  });
});

describe('caps hold against oversized files', () => {
  it('stops at the sheet cap', async () => {
    const buf = await build((wb) => {
      for (let i = 0; i < MAX_SHEETS + 5; i++) wb.addWorksheet(`S${i}`).addRow(['x']);
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets.length).toBeLessThanOrEqual(MAX_SHEETS);
  });

  it('stops at the row cap without erroring', async () => {
    const buf = await build((wb) => {
      const ws = wb.addWorksheet('Big');
      for (let i = 0; i < MAX_ROWS_PER_SHEET + 50; i++) ws.addRow([`row ${i}`]);
    });
    const sheets = await workbookToSheets(buf);
    expect(sheets[0].rows).toBeLessThanOrEqual(MAX_ROWS_PER_SHEET);
  });

  it('rejects garbage bytes with a throw, not a hang', async () => {
    await expect(workbookToSheets(Buffer.from('this is not a zip file'))).rejects.toThrow();
  });
});

describe('CSV is a one-sheet workbook', () => {
  it('keeps content lines and drops separator-only noise', () => {
    const sheets = csvToSheet('Day,Topic,Hours\nDay 1,Percentages,2\n,,,\n\nDay 2,TSD,2');
    expect(sheets).toHaveLength(1);
    expect(sheets[0].rows).toBe(3);
    expect(sheets[0].text).toContain('Day 2,TSD,2');
  });

  it('returns nothing for an empty file', () => {
    expect(csvToSheet('')).toEqual([]);
    expect(csvToSheet('\n\n,,\n')).toEqual([]);
  });
});

describe('the real file that broke in production (Shreya, 6 Aug)', () => {
  // CAT_2026_Weekly_Study_Plan_8hr_Weekdays.xlsx — a buddy-made plan: 117
  // dated day-rows with a task column per section, a 16-week phase sheet, and
  // a topic tracker. The first live Excel upload, and it failed. Kept as a
  // fixture so this format can never silently regress.
  it('extracts all three sheets with faithful cells', async () => {
    const buf = readFileSync(join(__dirname, '__fixtures__', 'buddy-weekly-plan.xlsx'));
    const sheets = await workbookToSheets(buf);
    expect(sheets.map((s) => s.name)).toEqual(['Daily Schedule', 'Weekly Plan', 'Topic Tracker']);

    const daily = sheets[0].text;
    // Dates as ISO — never the 1899-epoch/GMT garbage a naive Date print gives.
    expect(daily).toContain('2026-08-05');
    expect(daily).not.toContain('GMT');
    expect(daily).not.toContain('00:00:00');
    // The task text survives whole enough to carry topic names.
    expect(daily).toContain('Percentages, Ratio & Proportion');
    // Off days are present in the text (the extractor is told to skip them —
    // that judgement belongs to the prompt, not to this converter).
    expect(daily).toContain('OFF / blackout');

    const weekly = sheets[1].text;
    expect(weekly).toContain('Algebra I');
    expect(weekly).toContain('1 full mock + 2 sectionals');

    // The whole workbook stays comfortably inside the prompt budget.
    const total = sheets.reduce((n, s) => n + s.text.length, 0);
    expect(total).toBeLessThan(MAX_TOTAL_CHARS);
  });
});
