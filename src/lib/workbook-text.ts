// Excel workbook → plain text the timetable extractor can read.
//
// Founder, 6 Aug: "students will send excel files only mostly." Coaching
// institutes hand out .xlsx with several sheets — a daily sheet, a weekly
// sheet, a targets sheet — and until now the upload rejected the file outright.
//
// The extraction itself stays with the same AI prompt the photo/PDF path uses;
// this module's only job is to turn a workbook into faithful text. Faithful
// means the model sees "18:00", not 0.75 (Excel stores times as fractions of a
// day) and not "Sat Dec 30 1899 18:00:00 GMT+0553" (what naive Date printing
// produces — note the +0553: pre-1906 IST offsets, which is exactly the kind of
// garbage that makes a model hallucinate).
//
// This parses UNTRUSTED student uploads server-side. exceljs was chosen over
// the npm `xlsx` package deliberately: `xlsx` on npm is frozen at 0.18.5 with
// unpatched prototype-pollution and ReDoS advisories against crafted files.

import ExcelJS from 'exceljs';

export interface SheetText {
  /** The tab's name, exactly as the coaching named it ("Daily", "Week 3"...). */
  name: string;
  /** Rows as ` | `-joined cells, one line per row. Empty rows dropped. */
  text: string;
  rows: number;
}

// Caps: a real timetable is dozens of rows. Anything past these is either a
// data export or an attack, and silently truncating is stated by the caller.
export const MAX_SHEETS = 10;
export const MAX_ROWS_PER_SHEET = 300;
export const MAX_COLS = 40;
export const MAX_TOTAL_CHARS = 60_000;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * One cell → text. Excel's date-time cells arrive as JS Dates; which PART the
 * cell meant is encoded in the year. Excel's epoch is 30 Dec 1899, so a
 * pure-time cell ("6:00 PM") lands in 1899/1900 — print only the time. A real
 * date at midnight is a date; a dated class slot gets both.
 *
 * exceljs hands back dates in UTC; format from the UTC fields, never local.
 */
function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return '';
  if (v instanceof Date) {
    const time = `${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}`;
    if (v.getUTCFullYear() <= 1900) return time;
    const date = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    return time === '00:00' ? date : `${date} ${time}`;
  }
  if (typeof v === 'object') {
    // Rich text: the printed words, formatting dropped.
    if ('richText' in v && Array.isArray(v.richText)) {
      return v.richText.map((r) => r.text ?? '').join('');
    }
    // A formula cell's VALUE is its result — "=B2+1" itself tells the reader
    // nothing about the timetable.
    if ('result' in v && v.result !== undefined) return cellText(v.result as ExcelJS.CellValue);
    if ('error' in v) return '';
    // Hyperlink cells: the visible text.
    if ('text' in v && typeof (v as { text: unknown }).text === 'string') {
      return (v as { text: string }).text;
    }
    return '';
  }
  return String(v).trim();
}

/**
 * A whole workbook → labeled sheet texts, in tab order.
 *
 * Every sheet is kept separately and labeled with its own name, because the
 * names carry meaning ("Daily Plan" vs "Weekly Schedule" vs "Targets") and the
 * extractor is allowed to use them. Hidden sheets are skipped — the student
 * cannot see them either, and a plan should never be built from rows the
 * student cannot check.
 */
export async function workbookToSheets(buffer: Buffer): Promise<SheetText[]> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: SheetText[] = [];
  let totalChars = 0;

  for (const ws of wb.worksheets.slice(0, MAX_SHEETS)) {
    if (ws.state && ws.state !== 'visible') continue;

    const lines: string[] = [];
    const rowEnd = Math.min(ws.rowCount, MAX_ROWS_PER_SHEET);
    for (let r = 1; r <= rowEnd; r++) {
      const row = ws.getRow(r);
      const cells: string[] = [];
      const colEnd = Math.min(row.cellCount, MAX_COLS);
      for (let c = 1; c <= colEnd; c++) cells.push(cellText(row.getCell(c).value));
      // Trailing empties off; a fully empty row is layout, not content.
      while (cells.length && cells[cells.length - 1] === '') cells.pop();
      if (cells.length === 0) continue;
      lines.push(cells.join(' | '));
    }
    if (lines.length === 0) continue;

    const text = lines.join('\n');
    if (totalChars + text.length > MAX_TOTAL_CHARS) break;
    totalChars += text.length;
    sheets.push({ name: ws.name, text, rows: lines.length });
  }
  return sheets;
}

/** A CSV is a one-sheet workbook that skipped the workbook. */
export function csvToSheet(csv: string): SheetText[] {
  const lines = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.replace(/[,|;\s]/g, '').length > 0)
    .slice(0, MAX_ROWS_PER_SHEET);
  if (lines.length === 0) return [];
  const text = lines.join('\n').slice(0, MAX_TOTAL_CHARS);
  return [{ name: 'Sheet1', text, rows: lines.length }];
}

/** The block handed to the extractor: every sheet, labeled by its own name. */
export function sheetsToPromptText(sheets: SheetText[]): string {
  return sheets
    .map((s) => `=== SHEET: "${s.name}" ===\n${s.text}`)
    .join('\n\n');
}

// ── Windowing long day-plans ────────────────────────────────────────────────
//
// Live-fire against Shreya's real file proved the model cannot be trusted to
// self-limit: told "output only the next 21 days", it emitted every one of the
// 117 dated rows until it hit the output-token ceiling, and truncated JSON
// parses as nothing — the student sees "that doesn't look like a timetable"
// about a perfect file. So the window is enforced HERE, on the data: the model
// cannot overrun dates it never sees.

/** Keep a dated sheet's header + only the rows inside [today, today+spanDays]. */
export const DATED_WINDOW_DAYS = 21;
/** Sheets with fewer dated rows than this are left whole — no need to cut. */
export const DATED_WINDOW_THRESHOLD = 30;

const ISO_LINE = /^(\d{4}-\d{2}-\d{2})/;

export function windowDatedSheets(
  sheets: SheetText[],
  todayIso: string,
  spanDays = DATED_WINDOW_DAYS,
): SheetText[] {
  const endIso = new Date(Date.parse(todayIso + 'T00:00:00Z') + spanDays * 86_400_000)
    .toISOString().slice(0, 10);

  return sheets.map((sheet) => {
    const lines = sheet.text.split('\n');
    const datedCount = lines.filter((l) => ISO_LINE.test(l)).length;
    if (datedCount <= DATED_WINDOW_THRESHOLD) return sheet;

    const kept = lines.filter((l) => {
      const m = ISO_LINE.exec(l);
      if (!m) return true;                       // headers and notes stay
      return m[1] >= todayIso && m[1] <= endIso; // the actionable window
    });
    return { ...sheet, text: kept.join('\n'), rows: kept.length };
  });
}
