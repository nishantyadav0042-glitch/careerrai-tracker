import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

// ── The Weekly Insight is a WINDOW, not a system ───────────────────────────
//
// The founder's standing rule for this cycle: zero duplication, zero shadow
// systems, zero second authorities. A weekly review is exactly the kind of
// feature that grows a second one of everything by accident — its own cron,
// its own notification type, its own state table, its own copy of the
// "keep it short" rule — and each of those is a place where the weekly answer
// can start disagreeing with the daily one.
//
// It needs none of them, because a CLOSED calendar week is deterministic:
// the same student and the same week produce the same review forever, so it
// can be computed on read. That single property is what makes every guard
// below satisfiable rather than aspirational.

const SRC = 'src/lib/weekly-insight.ts';
const code = readFileSync(SRC, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...tsFiles(p));
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('the Weekly Insight adds no second system', () => {
  it('writes NOTHING — it is a pure read', () => {
    const writes = [...code.matchAll(/\.(insert|update|upsert|delete)\s*\(/g)].map((m) => m[1]);
    expect(
      writes,
      'The weekly review computes an answer that is already determined by the rows. A write means it has become a second record of the same fact, and the two can then disagree.',
    ).toEqual([]);
  });

  it('has no scheduler — no cron route computes it', () => {
    const cronDir = 'src/app/api/cron';
    const offenders = tsFiles(cronDir).filter((f) => /weekly-insight/.test(readFileSync(f, 'utf8')));
    expect(
      offenders,
      'A cron would make the scheduler a SECOND producer of a fact the window already determines:\n  ' + offenders.join('\n  '),
    ).toEqual([]);
  });

  it('has no cron entry in vercel.json', () => {
    const vercel = readFileSync('vercel.json', 'utf8');
    expect(vercel).not.toMatch(/weekly-insight/);
  });

  it('sends nothing — no notification, push or email import', () => {
    expect(code).not.toMatch(/from ['"].*notification-os['"]/);
    expect(code).not.toMatch(/from ['"].*\/push['"]/);
    expect(code).not.toMatch(/from ['"].*\/email['"]/);
    expect(code).not.toMatch(/\bdispatch\s*\(/);
  });

  it('declares no new notification type', () => {
    const os = readFileSync('src/lib/notification-os.ts', 'utf8');
    expect(os).not.toMatch(/weekly_insight/);
  });

  it('adds no table of its own', () => {
    const files = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
    const offenders = files.filter((f) => /weekly_insight/.test(readFileSync(join('supabase/migrations', f), 'utf8')));
    expect(offenders, `A weekly review needs no state — it is a function of the week:\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  it('inherits the length contract instead of copying it', () => {
    expect(
      code,
      'weekly-insight.ts must import clampSentence from daily-insight.ts. A second trimming implementation is a second definition of "keep it short", and they drift.',
    ).toMatch(/import \{ clampSentence \} from '\.\/daily-insight'/);
    // And it must not have grown its own.
    expect(code).not.toMatch(/lastIndexOf\('\. '\)/);
  });

  it('does not re-implement the daily selection either', () => {
    // The daily engine picks ONE insight by priority and suppresses repeats.
    // The weekly review shows everything it can evidence. Different questions,
    // and the weekly one must not grow a suppression ledger of its own.
    expect(code).not.toMatch(/daily_insight_shown/);
    expect(code).not.toMatch(/insightKey|suppressedKeys/);
  });

  it('reads only the student rows it names', () => {
    const tables = [...code.matchAll(/\.from\('([a-z_]+)'\)/g)].map((m) => m[1]).sort();
    expect(
      [...new Set(tables)],
      'A new table here is a new data authority for the weekly answer. Add it deliberately, not by autocomplete.',
    ).toEqual(['daily_reports', 'daily_routines', 'routine_task_completions', 'video_sessions']);
  });
});
