import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── AI is produced on tap, never on open ────────────────────────────────────
//
// Founder, 9 Aug: "don't automatically produce AI response — someone has to tap
// to get the response, don't make it auto ready."
//
// This is a cost rule and a trust rule at once. The cost half is arithmetic:
// every auto-fired call is paid for whether or not a human reads the sentence,
// and at 150-200 signups a day the ones that fire per log or per cron row grow
// with the roster rather than with usage. The trust half is that a summary
// generated in advance is a summary generated from whatever the data looked
// like at the time, presented as if it were current.
//
// Three auto-fire paths were removed on 9 Aug and this guard is what stops them
// growing back:
//   1. weekly-signal-card fired Gemini from a useEffect on mount, so opening a
//      student's page spent a call.
//   2. log-daily generated a buddy briefing on every mock log and every
//      non-"all good" mood log.
//   3. the buddy-brief cron refreshed a briefing every morning for every
//      student who had logged the day before.
//
// A guard test is used here rather than a unit test because the defect is
// structural — it is about WHERE a call is written, which no amount of testing
// the function itself can catch.

const ROOT = 'src';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p)) out.push(p);
  }
  return out;
}

const FILES = walk(ROOT);

/**
 * Source with comments stripped.
 *
 * Every one of these checks reads code, never prose. The removals above left
 * comments behind that NAME the function they removed — which is the point of
 * the comment and would otherwise make the guard fail on the very fix it is
 * guarding. (This has now bitten three separate guard tests in this repo: a
 * comment quoting the old value is still a match.)
 */
function code(path: string): string {
  return readFileSync(path, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '');
}

/** Every module that can reach Gemini, directly or through a helper. */
const AI_PRODUCERS = [
  'callGemini',
  'generateBuddyBriefing',
];

describe('no AI response is produced without a human tap', () => {
  it('the buddy briefing has exactly one producer, and it is the Refresh button', () => {
    // `api/buddy/briefing/[studentId]` POST is the route the Refresh button
    // calls. If a second caller appears, someone has re-created the ambient
    // path — name it here and justify it, or route it through a tap.
    const callers = FILES.filter(
      (f) => !f.endsWith('lib/buddy-briefing.ts') && code(f).includes('generateBuddyBriefing'),
    );
    expect(callers).toEqual(['src/app/api/buddy/briefing/[studentId]/route.ts']);
  });

  it('no cron generates a briefing', () => {
    // Crons iterate the whole roster in one invocation, so an AI call inside
    // one costs the roster, every day, forever.
    const crons = FILES.filter((f) => f.includes('api/cron/'));
    expect(crons.length).toBeGreaterThan(0);
    for (const f of crons) {
      for (const producer of AI_PRODUCERS) {
        expect(code(f), `${f} generates AI inside a cron`).not.toContain(producer);
      }
    }
  });

  it('the daily log notifies the buddy but writes no AI', () => {
    const src = code('src/app/api/logging/log-daily/route.ts');
    expect(src).not.toContain('generateBuddyBriefing');
    // The notification itself must survive — removing the AI must not have
    // quietly removed the buddy's signal that something happened.
    expect(src).toContain('notifyBuddyMock');
    expect(src).toContain('notifyBuddyEmotional');
  });

  it('the weekly signal reaches Gemini only when asked, and defaults to not asking', () => {
    const route = readFileSync('src/app/api/weekly-signal/route.ts', 'utf8');
    // The flag exists, is read off the body, and short-circuits before the call.
    expect(route).toContain('generate');
    expect(route).toMatch(/if \(!generate\)/);
    // The early return must come BEFORE callGemini, or the flag is decoration.
    expect(route.indexOf('if (!generate)')).toBeLessThan(route.indexOf('await callGemini'));

    // The card loads stats without the flag, and sends it only from a handler.
    const card = readFileSync('src/components/weekly-signal-card.tsx', 'utf8');
    expect(card).toContain('generate: true');
    // The mount effect calls `load`, and `load` must not be the generating one.
    const loadBody = card.slice(card.indexOf('const load = useCallback'), card.indexOf('useEffect(() => { load(); }'));
    expect(loadBody).not.toContain('generate: true');
    // The generating function is wired to an onClick, not an effect.
    expect(card).toContain('onClick={generateInsight}');
    expect(card).not.toMatch(/useEffect\([^)]*generateInsight/);
  });

  it('every Gemini caller is reachable only from an upload, a tap, or moderation', () => {
    // The full inventory, stated so a new caller has to be added here
    // deliberately. Each entry says what a human did to cause the call.
    const REACHED_BY: Record<string, string> = {
      'src/app/api/timetable/parse/route.ts': 'student uploads a timetable photo',
      'src/app/api/parse-scorecard/route.ts': 'student uploads a scorecard',
      'src/lib/community-safety.ts': 'student submits content — moderation, not summary',
      'src/lib/buddy-briefing.ts': 'buddy taps Refresh',
      'src/lib/mentor-doors.ts': 'founder activates a mentor grant in admin',
      'src/app/api/weekly-signal/route.ts': 'buddy taps "Read this week with AI"',
      'src/app/api/feedback-draft/route.ts': 'buddy taps "AI facts"',
      'src/app/api/chat/draft/route.ts': 'buddy taps "Get reply facts"',
      'src/app/api/coach-line/route.ts': 'DEAD — no component renders CoachLine; scheduled for deletion after merge',
      'src/lib/gemini.ts': 'the client itself',
    };
    const actual = FILES.filter((f) => code(f).includes('callGemini')).sort();
    expect(actual).toEqual(Object.keys(REACHED_BY).sort());
  });
});
