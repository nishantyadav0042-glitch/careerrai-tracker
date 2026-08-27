import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── EVERY PATH THAT WRITES A SESSION TELLS SOMEBODY, AND NEVER DIES TRYING ──
 *
 * 27 Aug. /api/sessions/schedule created a session through
 * book_session_credit(), emitted a timeline row, and dispatched nothing. The
 * student who had just paid ₹299 got no notification, and the mentor whose
 * hour had just been taken got none either — `recipient_type 'buddy'` had no
 * dispatch call site anywhere in the codebase.
 *
 * The sibling route had told the student since the Event OS cycle. So the
 * defect was not "we forgot notifications", it was "we covered one of two
 * paths and nothing noticed the other" — which is exactly the failure a
 * structural guard exists to prevent, because the next booking path will be
 * written by someone who never read this incident.
 *
 * 27 Aug, SECOND PASS — this guard had the same shape as the defect it
 * describes. Four of its six assertions were hardcoded to
 * `sessions/schedule/route.ts`; the sibling route was checked only for "the
 * token `dispatch(` appears in this file". Under that weak check,
 * calendar/schedule-meeting shipped a bare `await dispatch(...)` inside the
 * route's only try block, so a transport failure answered the mentor with 500
 * for a session already committed — the precise thing assertion (5) exists to
 * forbid. The guard was green the whole time, because (5) never ran on that
 * file, and because a file-level search for `catch { console.error }` is
 * satisfied by every route's OUTER catch. A guard that reads the wrong scope
 * is worse than no guard: it is a green light over an unlit road.
 *
 * THE RULES, now enforced per-route on every route in the table below:
 *   1. it calls dispatch(), through the ONE authority
 *   2. its copy comes from lib/session-link, so paths cannot drift
 *   3. the notifier is CALLED on the write path, not merely defined
 *   4. the notifier owns its own try/catch — checked inside the function body,
 *      never at file level, because the outer catch would satisfy that
 *   5. no bare dispatch( survives in the handler, where the outer catch would
 *      make a transport failure fatal to a write that already committed
 *
 * Comments are stripped before matching. This repo has been bitten at least
 * six times by a guard that matched its own explanatory prose and passed on a
 * file whose CODE said the opposite; the prose above would do it again.
 */

const ROOT = join(__dirname, '..');

/** Strip // line comments and block comments, so prose can never satisfy a guard. */
function codeOnly(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

/**
 * The body of a named function, by brace matching from its declaration.
 *
 * Assertions (4) and (5) are only meaningful against a SCOPE. Matching at file
 * level is what let the defect through: every one of these routes has an outer
 * `catch (error) { console.error(...) }`, so "the file contains a catch that
 * logs" is true even when the dispatch sits outside every one of them.
 */
function functionBody(code: string, name: string): string {
  const decl = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`);
  const at = code.search(decl);
  if (at === -1) return '';

  // Skip the PARAMETER LIST before looking for the body brace. These notifiers
  // take an inline object type (`opts: { sessionId: string; ... }`), so the
  // first `{` after the name belongs to that type, not to the function. The
  // first version of this helper matched it and returned the type body — which
  // contains no dispatch, so every assertion below failed on correct code.
  const paren = code.indexOf('(', at);
  if (paren === -1) return '';
  let parens = 0;
  let afterParams = -1;
  for (let i = paren; i < code.length; i++) {
    if (code[i] === '(') parens++;
    else if (code[i] === ')') {
      parens--;
      if (parens === 0) { afterParams = i + 1; break; }
    }
  }
  if (afterParams === -1) return '';

  const open = code.indexOf('{', afterParams);
  if (open === -1) return '';
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    if (code[i] === '{') depth++;
    else if (code[i] === '}') {
      depth--;
      if (depth === 0) return code.slice(open + 1, i);
    }
  }
  return '';
}

/**
 * Every route that WRITES a video_sessions row a human is waiting on.
 *
 * `notifier` is the function that owns the telling; it must be called from the
 * handler and must swallow its own failures. reschedule-meeting is here even
 * though it moves an existing session rather than creating one: a student
 * whose session moved and was never told is holding a wrong time, which is the
 * same defect wearing a different verb.
 *
 * `success` anchors on the NEW-BOOKING success return specifically, never on
 * every success return. Each of these routes also has an `already: true`
 * replay return for a double-submit, and that one must NOT notify — the
 * student was told when the session was first booked, and telling them again
 * because a mentor's finger slipped is a different defect. Anchoring on
 * `NextResponse.json(payload)` matched the replay first and failed the guard
 * on correct code, which is how this comment came to exist.
 */
const BOOKING_ROUTES = [
  {
    rel: 'app/api/sessions/schedule/route.ts',
    notifier: 'tellBothParties',
    // The success return is the moment the student is told "booked".
    success: /return\s+NextResponse\.json\(\s*\{\s*ok:\s*true,\s*sessionId,\s*meetUrl/,
  },
  {
    rel: 'app/api/calendar/schedule-meeting/route.ts',
    notifier: 'tellTheStudent',
    success: /const\s+payload\s*=\s*\{\s*success:\s*true,\s*meetingId:\s*sessionId,\s*meetLink\s*\}/,
  },
  {
    rel: 'app/api/calendar/reschedule-meeting/route.ts',
    notifier: 'tellTheStudentItMoved',
    success: /const\s+payload\s*=\s*\{\s*success:\s*true,\s*meetingId:\s*session\.id,\s*meetLink,\s*startTime/,
  },
] as const;

describe('every session-writing path notifies through dispatch()', () => {
  it.each(BOOKING_ROUTES)('$rel calls dispatch()', ({ rel }) => {
    const path = join(ROOT, rel);
    expect(existsSync(path), `${rel} moved — update this guard`).toBe(true);
    const code = codeOnly(readFileSync(path, 'utf8'));
    expect(code, `${rel} writes a session but never calls dispatch()`).toMatch(/\bdispatch\s*\(/);
  });

  it.each(BOOKING_ROUTES)('$rel imports the ONE dispatch authority', ({ rel }) => {
    const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
    expect(code).toMatch(/from\s+['"]@\/lib\/notification-os['"]/);
  });

  it.each(BOOKING_ROUTES)('$rel takes its wording from lib/session-link', ({ rel }) => {
    const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
    expect(code, `${rel} should import its wording from lib/session-link`)
      .toMatch(/from\s+['"]@\/lib\/session-link['"]/);
  });

  it('the student self-serve path tells the BUDDY, not only the student', () => {
    const code = codeOnly(
      readFileSync(join(ROOT, 'app/api/sessions/schedule/route.ts'), 'utf8'),
    );
    // Two dispatch calls: one per human. A single call cannot cover both.
    const calls = code.match(/\bdispatch\s*\(\s*\{/g) ?? [];
    expect(calls.length, 'expected one dispatch for the student and one for the buddy').toBe(2);
    expect(code).toMatch(/userId:\s*opts\.buddyId/);
    expect(code).toMatch(/userId:\s*opts\.studentId/);
  });

  it.each(BOOKING_ROUTES)(
    '$rel CALLS its notifier before answering success, not merely defines it',
    ({ rel, notifier, success }) => {
      // Mutation testing caught this guard passing on the defect it exists to
      // stop: deleting the call while leaving the function in place kept
      // `dispatch(` present in the file, so a file-level match was satisfied by
      // dead code. A notifier nothing invokes is precisely what shipped.
      const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));

      const postAt = code.search(/export\s+async\s+function\s+POST\s*\(/);
      expect(postAt, `${rel}: POST handler not found`).toBeGreaterThan(-1);
      const post = code.slice(postAt);

      const successAt = post.search(success);
      expect(successAt, `${rel}: success return not found — update this guard`).toBeGreaterThan(-1);

      // Somewhere between entering POST and answering success, the humans are
      // told. Matching a CALL — an identifier followed by `(` that is not a
      // declaration — so a definition alone can never satisfy it.
      const beforeSuccess = post.slice(0, successAt);
      expect(
        new RegExp(`(?<!function\\s)\\b${notifier}\\s*\\(`).test(beforeSuccess),
        `${rel}: POST writes a session and returns success without notifying anyone`,
      ).toBe(true);
    },
  );

  it.each(BOOKING_ROUTES)(
    '$rel: notification failure can never fail a committed write',
    ({ rel, notifier }) => {
      // Checked INSIDE the notifier. At file level every one of these routes
      // has an outer `catch (error) { console.error(...) }` that would satisfy
      // the match while the dispatch sat outside it — which is exactly how the
      // schedule-meeting defect stayed green here for a full cycle.
      const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
      const body = functionBody(code, notifier);

      expect(body, `${rel}: notifier ${notifier}() not found — update this guard`).not.toBe('');
      expect(body, `${rel}: ${notifier}() does not dispatch`).toMatch(/\bdispatch\s*\(/);
      expect(body, `${rel}: ${notifier}() does not guard its own failure`).toMatch(/\btry\s*\{/);
      // Silent would be a different defect; fatal would reject a write that
      // already happened.
      expect(
        /catch\s*\([\s\S]{0,40}\)\s*\{[\s\S]{0,200}console\.error/.test(body),
        `${rel}: ${notifier}() must catch and LOG, not swallow and not rethrow`,
      ).toBe(true);
    },
  );

  it.each(BOOKING_ROUTES)(
    '$rel keeps no bare dispatch( in the handler, where the outer catch is fatal',
    ({ rel, notifier }) => {
      // The actual defect, stated directly: a dispatch reachable from POST but
      // outside the notifier is inside the route's own try, so a transport
      // failure becomes a 500 for a session that already exists.
      const code = codeOnly(readFileSync(join(ROOT, rel), 'utf8'));
      const notifierBody = functionBody(code, notifier);
      const postBody = functionBody(code, 'POST');

      expect(postBody, `${rel}: POST body not found — update this guard`).not.toBe('');
      // Remove the notifier's own body if POST happens to enclose it, so the
      // legitimate dispatch is never counted against the handler.
      const handlerOnly = notifierBody ? postBody.split(notifierBody).join('') : postBody;

      expect(
        /\bdispatch\s*\(/.test(handlerOnly),
        `${rel}: dispatch() is called in POST outside ${notifier}() — a transport ` +
          'failure there is fatal to a write that already committed',
      ).toBe(false);
    },
  );
});
