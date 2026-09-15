// ── WHY THE SCANNER SAID NO ─────────────────────────────────────────────────
//
// Found 15 Sep 2026, digging the counsellors' notes. Three students told a
// counsellor, independently, that their coaching schedule and the app's plan
// do not match. The plan engine turned out to be right: when a timetable is
// saved, it owns the day (lib/timetable-day). The problem is upstream — almost
// nobody gets a timetable IN.
//
//   357 coaching students          17 with a saved timetable   (4.8%)
//   280 dismissed the ask          62 tried to upload
//    26 saved                      32 parse failures           (46% of tries)
//
// Of those failures, 23 across 12 distinct students were 422s, spread from
// 25 Jul to 8 Sep. Seven weeks. And we could not say why ANY of them failed,
// because the route had four different ways to answer 422 and recorded which
// one to nothing:
//
//   · the workbook would not open (corrupt / password-protected)
//   · the workbook had no readable rows
//   · the model said "this is not a timetable"
//   · the model read it and found neither a class nor a target
//
// Only the last writes a timeline row, and production has ZERO of those — so
// the 23 came from the other three, indistinguishable. A failure you cannot
// name is a failure you cannot fix, which is exactly how this survived seven
// weeks of real students walking away.
//
// So every refusal now carries a stable code, the client records it on
// `timetable_parse_failed`, and next week's number can be read instead of
// guessed.
//
// ══ THE PROMISE WE WERE NOT KEEPING ═════════════════════════════════════════
//
// Three of these messages used to end "…or add your classes by hand." There is
// no by-hand path. The phrase appeared nowhere in the product outside these
// three strings — a student who failed the scan was told to do something the
// app has never offered, and then handed back the same upload button.
//
// The messages now name only doors that exist, and `noPhantomDoors` in the
// test beside this file keeps it that way. Compare MockDebriefModal, which
// says "fill in manually" and has the form to back it: that is the standard.

/** Every way the timetable scanner can refuse. Stable — these are counted. */
export type RefusalCode =
  | 'file_missing'
  | 'legacy_xls'
  | 'unsupported_type'
  | 'file_too_large'
  | 'quota_exceeded'
  | 'workbook_unreadable'
  | 'workbook_empty'
  | 'model_reply_unreadable'
  | 'not_a_timetable'
  | 'nothing_readable'
  | 'scanner_unavailable';

export interface Refusal {
  code: RefusalCode;
  status: number;
  /** What the student reads. Names the file, never the student. */
  message: string;
}

/**
 * The status codes are the ones production already emits, unchanged.
 *
 * Deliberate: seven weeks of `timetable_parse_failed` rows carry a status and
 * nothing else, and changing what a status means now would make the old rows
 * lie. The code is the new information; the status stays comparable.
 */
const REFUSALS: Record<RefusalCode, Omit<Refusal, 'code'>> = {
  file_missing: {
    status: 400,
    message: 'Nothing came through — pick the file again.',
  },
  legacy_xls: {
    status: 400,
    message: 'That is an old-format .xls file. Open it and save as .xlsx, then upload again.',
  },
  unsupported_type: {
    status: 400,
    message: 'Upload a photo (JPG/PNG), a PDF, or an Excel file (.xlsx/.csv).',
  },
  file_too_large: {
    status: 413,
    message: 'That file is too large — try a photo instead of a scan.',
  },
  quota_exceeded: {
    status: 429,
    message: "That's a lot of uploads — take a break and try again in a while.",
  },
  workbook_unreadable: {
    status: 422,
    message: "Couldn't open that Excel file — it may be corrupted or password-protected. Re-save it and try again.",
  },
  workbook_empty: {
    status: 422,
    message: 'That file has no readable rows. Check the sheet has your timetable in it.',
  },
  // Split from not_a_timetable deliberately. "The model judged this photo not
  // to be a timetable" and "the model answered and we could not parse it" look
  // identical to a student and are opposite problems for us: the first is a
  // photo, the second is our own extractor. Counted together they would have
  // pointed the next investigation at the wrong half.
  model_reply_unreadable: {
    status: 422,
    message: "Couldn't read that one — try a clearer photo, or skip this and we'll plan your topics for you.",
  },
  // The two the 12 students most likely hit. Both now say what to do next, and
  // both say the true one: skipping is allowed and costs the student nothing.
  not_a_timetable: {
    status: 422,
    message: "That doesn't look like a class timetable. Try a clearer photo — or skip this, and we'll plan your topics for you.",
  },
  nothing_readable: {
    status: 422,
    message: "Couldn't read any classes or targets from that. Try a clearer photo — or skip this, and we'll plan your topics for you.",
  },
  scanner_unavailable: {
    status: 503,
    message: 'The scanner is busy right now — try again in a moment, or skip and add your timetable later from Home.',
  },
};

export function refusal(code: RefusalCode): Refusal {
  return { code, ...REFUSALS[code] };
}

/** The codes, for tests and for anything that counts them. */
export const REFUSAL_CODES = Object.keys(REFUSALS) as RefusalCode[];

/**
 * Doors the product does not have.
 *
 * A refusal message may only send a student somewhere that exists. "Add your
 * classes by hand" cost twelve students their upload because it named a screen
 * nobody ever built; if that screen is built, delete the phrase from here in
 * the same commit and the test will let it back in.
 */
export const PHANTOM_DOORS = [/by hand/i, /manually/i, /type them in/i];
