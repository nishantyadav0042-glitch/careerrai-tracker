// The timetable-extraction prompts — one place, exported, so the route and
// any test harness build EXACTLY the same words. When a real file fails in
// production, the debugging loop is: run this same prompt against the same
// file locally and read the model's actual answer — which is only possible
// because nothing here is trapped inside a route handler.

import { ALLOWED_TOPICS } from './timetable';

export const VISION_PREFACE = `You are reading a photo, screenshot or PDF of something a CAT coaching institute gave a student (Rodha, TIME, IMS, CL, Endeavor, Cracku, Unacademy...).`;
// Spreadsheet plans are usually richer than a photographed class timetable —
// Shreya's real file (the format this preface is tuned against) is a 117-row
// dated day-plan with one task column PER SECTION, plus a weekly phase sheet.
// Two rules below exist specifically for that shape: a day-plan without clock
// times IS a timetable, and long plans are windowed to the next three weeks so
// the output can never truncate mid-JSON (the failure the founder hit live:
// truncated output parses as nothing, and a perfect file gets "that doesn't
// look like a timetable").
export const spreadsheetPreface = (todayIso: string) => `You are reading the TEXT extracted from an Excel/CSV file a CAT coaching institute or mentor gave a student. Each sheet of the workbook appears below under a === SHEET: "name" === header. Cells are separated by " | ", one row per line. Sheet names carry meaning — "Daily"/"Day wise" is usually a day plan, "Weekly"/"Schedule" a class timetable or phase plan, "Targets" a target list. Read EVERY sheet; the answer merges all of them.

SPREADSHEET-SPECIFIC RULES (these OVERRIDE anything below that conflicts):
- A DAY-PLAN GRID — dated or Day-N rows where each row describes study tasks (often one column per section: "VARC task", "QA task", "DILR task") — IS a timetable. Set "is_timetable": true even when no clock times appear anywhere.
- For such rows output one block PER SECTION TASK: the row's date (or dayIndex), that column's section, "start"/"end" null, "topic" matched from the allowed list when the cell names one, "label" a SHORT version of the cell text (max ~10 words).
- TODAY is ${todayIso}. If the plan spans MORE than 30 dated days, output blocks ONLY for dates from ${todayIso} through 21 days later — earlier rows are the past and later rows will still be here next week. Weekly/phase sheets and targets are NOT windowed: read those whole.
- Rows marked OFF / blackout / rest / holiday are days off — skip them entirely, exactly as the skip rule below says.
- A week-level phase sheet ("Week 5 | 07 Sep-13 Sep | Algebra I | ... | 1 full mock + 2 sectionals") does not produce class blocks, but its tests/mocks column often states real targets — extract those, and a printed syllabus-completion week ("Syllabus closure") may state syllabus_end_date only if an actual end date is printed.`;

export const EXTRACT_RULES = `It may be ANY of these, and often it is not a timetable at all:
 (a) a weekly class timetable with days and times,
 (b) a TARGET / strategy message listing how much to complete ("15-20 Quant sectionals by end September", "200 LRDI sets", "100+ topic tests"),
 (c) both.

Extract whatever is actually there. An empty list is correct when that thing isn't present — do NOT invent class times for a target message, and do NOT invent targets for a plain timetable. Return STRICT JSON only:

{
  "is_timetable": boolean,
  "syllabus_end_date": "YYYY-MM-DD" or null,
  "blocks": [
    { "day": 0, "date": null, "dayIndex": null, "start": "18:00", "end": "20:00", "section": "QA", "topic": "Time Speed Distance", "label": "Arithmetic - TSD", "minutes": 120 }
  ],
  "targets": [
    { "kind": "sectional", "label": "15-20 Quant sectionals by end September", "count": 20, "section": "QA", "deadline": "2026-09-30" },
    { "kind": "sets", "label": "200 LRDI sets", "count": 200, "section": "DILR", "deadline": null }
  ]
}

RULES — follow exactly:
- "is_timetable": false if this image is clearly not a class schedule. Then return an empty blocks array.
CLASS ROWS — sheets come in three shapes. Use whichever the sheet actually is, and set the other two anchors to null:
  A. RECURRING WEEKLY ("Mon 6-8pm Arithmetic") -> "day": 0=Monday ... 6=Sunday.
  B. DATED CALENDAR ("26 Sep 23 | Tuesday | 10 PM-12 AM | Quant | Geometry Basics 1")
     -> "date": "YYYY-MM-DD". Use the printed date. A two-digit year like "23" means 2023.
        Also set "day" when the weekday is printed. NEVER drop the date — a dated
        syllabus is a sequence, and collapsing it to weekdays destroys the order.
  C. RELATIVE DAY PLAN ("Day 1 ... Day 5", each with hourly slots)
     -> "dayIndex": 1, 2, 3 ... Do NOT invent a weekday or a date for these.
At least one of day / date / dayIndex MUST be set, or omit the row.
- "start"/"end": 24-hour "HH:MM", zero padded. Infer am/pm sensibly from the batch: an evening batch's "6-8" means 18:00-20:00, a morning slot's "9 AM - 10 AM" means 09:00-10:00. Late batches really do run "10 PM - 12 AM" (22:00 to 00:00) — record that as given.
- For entries with NO usable time ("Whole Day", "Practice Session", "Rest"), set both "start" and "end" to null. Do not invent hours.
- SKIP rows that are holidays, blank days or breaks with no study content (e.g. a row that only says "Sunday", "Dussehra", "LUNCH BREAK"). A colour-filled empty row is a day off, not a class.
- "section": exactly one of "QA", "VARC", "DILR", or null if unclear.
    QA = Quantitative Aptitude / Maths / Arithmetic / Algebra / Geometry / Number System.
    VARC = Verbal / English / Reading Comprehension / Grammar / Vocabulary.
    DILR = Data Interpretation / Logical Reasoning / LRDI / DI-LR.
- "topic": MUST be copied EXACTLY from the ALLOWED TOPICS list below, or null.
    Choose the closest match by meaning (e.g. "TSD" -> "Time Speed Distance", "P&C" -> "Permutation & Combination", "RC" -> "Reading Comprehension").
    If nothing in the list clearly matches, use null. NEVER invent a topic name and NEVER return a topic that is not in the list character-for-character.
- "label": the raw text as printed on the timetable, so nothing is lost.
- "minutes": planned minutes for THIS task, only when the sheet states a duration — an explicit minutes column ("Planned mins | 480" split across that row's tasks proportionally is NOT allowed; only per-task figures), an in-cell duration ("2 hrs: ..." -> 120, "30 min editorial" -> 30), or the start/end times. If the row states a WHOLE-DAY total and per-task splits ("2 hrs" VARC, "3 hrs" QA, "2 hrs" DILR), use each task's own figure. No duration printed -> null. NEVER estimate.
- Ignore breaks, lunch, holidays, test/mock slots that name no topic — unless they are actual scheduled classes.
- If the same class repeats on several days, output one block per day.
TARGETS — how much work the coaching expects completed:
- "kind": one of "sectional", "topic_test", "mock", "questions", "sets", "revision", "classes", "other".
- "count": the number to complete, as an integer. For a RANGE like "15-20", use the HIGHER number (20). For "100-150+", use 150. If no number is given (e.g. "complete Arithmetic revision"), use null. NEVER guess a number.
- "section": "QA", "VARC", "DILR", or null.
- "label": the target in the coaching's own words, kept short.
- "deadline": "YYYY-MM-DD" only if a real date or month-end is stated ("by end September" -> that month's last day of the CURRENT year). Otherwise null.
- Ignore motivational lines, greetings and general advice. Only extract things with a countable or completable deliverable.

- "syllabus_end_date": ONLY if the document literally prints a date on which the syllabus/course finishes (e.g. "Course ends 30 Nov 2026", "Syllabus completion: 15/10/2026"). Return it as "YYYY-MM-DD". If no such date is printed anywhere, return null. NEVER estimate, infer, or calculate this date — a wrong date here damages the student's whole study plan. When unsure, return null.

ALLOWED TOPICS (the ONLY permitted values for "topic"):
${ALLOWED_TOPICS.join('\n')}`;

export const EXTRACT_PROMPT = `${VISION_PREFACE}\n\n${EXTRACT_RULES}`;
export const spreadsheetPrompt = (todayIso: string) => `${spreadsheetPreface(todayIso)}\n\n${EXTRACT_RULES}`;


/**
 * Rescue a JSON object truncated mid-array by an output-token ceiling.
 *
 * The failure this repairs is not hypothetical: the model hit MAX_TOKENS on a
 * real file and the reply died at `"label": "3 hrs: Functions, ..."},` — 60
 * complete, perfectly good blocks followed by a missing `]}`. Throwing all 60
 * away over the missing two characters is how a working feature reads as
 * broken. The rescue trims back to the last COMPLETE object and closes the
 * brackets that are actually open; if nothing parses, null — never a guess.
 */
export function salvageTruncatedJson<T>(raw: string): T | null {
  const text = raw.trim();
  try { return JSON.parse(text) as T; } catch { /* fall through to the rescue */ }

  // Walk back through candidate cut points: the end of a complete object, or
  // an array opener (when truncation hit before ANY element completed, the
  // honest rescue is that array, empty).
  let cut = text.length;
  for (let attempt = 0; attempt < 40; attempt++) {
    const lastBrace = text.lastIndexOf('}', cut - 1);
    const lastOpen = text.lastIndexOf('[', cut - 1);
    cut = Math.max(lastBrace, lastOpen);
    if (cut <= 0) return null;
    const head = text.slice(0, cut + 1);
    // Close whatever is still open, deepest first.
    const closers: string[] = [];
    let inString = false;
    for (let i = 0; i < head.length; i++) {
      const ch = head[i];
      if (inString) {
        if (ch === '\\') i++;
        else if (ch === '"') inString = false;
        continue;
      }
      if (ch === '"') inString = true;
      else if (ch === '{') closers.push('}');
      else if (ch === '[') closers.push(']');
      else if (ch === '}' || ch === ']') closers.pop();
    }
    if (inString) continue; // cut landed inside a string — walk further back
    try {
      return JSON.parse(head + closers.reverse().join('')) as T;
    } catch { /* walk further back */ }
  }
  return null;
}
