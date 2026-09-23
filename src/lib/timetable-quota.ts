// ── THE SCANNER'S QUOTA, SIZED TO WHAT THE UPLOAD SCREEN ALLOWS ─────────────
//
// Bug-fix sprint, 23 Sep 2026. The scanner counts one use per PHOTO parsed
// (each photo is its own model call). The upload screen accepts up to 8 photos
// in one go, because a weekly sheet is usually shot in parts, but the server
// allowed only 6 parses an hour. So a single full upload was refused on photos
// 7 and 8 the first time a student tried, and every retry inside the hour was
// refused too. Production, 6 Sep: one coaching student parsed 6 photos across
// two uploads, then her next 6-photo upload and every retry after it came back
// 429 — 12 refusals in a minute. Sales heard it as "the upload fails".
//
// The cost guard stays (the model key is shared); it is re-expressed in
// UPLOADS so the two numbers can never disagree again: an hour allows one full
// upload and one full retry, a day allows four full uploads.

/** The most photos one upload may carry. The upload screen slices to this. */
export const MAX_FILES_PER_UPLOAD = 8;

/** Parses (photos) per student per rolling hour: one full upload + one full retry. */
export const PARSES_PER_HOUR = 2 * MAX_FILES_PER_UPLOAD;

/** Parses (photos) per student per rolling day: four full uploads. */
export const PARSES_PER_DAY = 4 * MAX_FILES_PER_UPLOAD;

/** True when this student has used their scanner budget. Pure. */
export function scannerQuotaExceeded(parsesLastHour: number, parsesLastDay: number): boolean {
  return parsesLastHour >= PARSES_PER_HOUR || parsesLastDay >= PARSES_PER_DAY;
}
