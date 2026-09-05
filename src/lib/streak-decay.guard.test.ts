import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { liveStreak } from '@/lib/streak-utils';

// ── The streak that would not die ───────────────────────────────────────────
//
// `streak_data.current_streak` is written when a student logs and NEVER decays
// on its own. Miss a day and the column keeps the old number until the next
// log. So the stored value means "the streak this student HAD at their last
// log" — never "the streak they have".
//
// `liveStreak()` has existed since 20 July with the rule written in its own
// docblock: "Every DISPLAY of a streak must go through this." The rule was
// documented and nothing enforced it, so it eroded into ten files — including
// the student's own logging screen, the daily routine payload, the 08:00
// morning push, the mentor's suggestion list, the sales-ready criterion and
// the intervention ledger's before/after measurement.
//
// The founder found it the ordinary way: production showed 27 students on a
// 3+ day streak and 4 above seven days. Rebuilt from `daily_reports`, the real
// numbers were 8 and ZERO — students who had last logged 42, 23 and 21 days
// ago were still being counted as active streaks.
//
// A rule that lives only in a comment is a rule that erodes. This is the same
// rule, executable.

const SRC = join(process.cwd(), 'src');

/**
 * Files allowed to touch the raw column, each for a reason that is not display.
 * Adding a row here is a deliberate act: say why, or use liveStreak().
 */
const RAW_ALLOWED: Record<string, string> = {
  'lib/streak-utils.ts': 'defines liveStreak/momentumStreak — the decay itself',
  'lib/streak-decay.guard.test.ts': 'this guard',
  'lib/metric-registry.ts': 'names the column in prose, does not read it',
  'app/api/logging/log-daily/route.ts': 'WRITES the streak; must read the stored value to advance it',
  'app/api/streak/restore/route.ts': 'restores a broken streak — the stored value is the thing being restored',
  'app/student/debug/page.tsx': 'deliberately shows stored AND live side by side, to catch exactly this bug',
  'types/index.ts': 'type declaration',
};

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}

describe('liveStreak', () => {
  it('reports a streak logged today or yesterday', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    expect(liveStreak(7, '2026-09-05', now)).toBe(7);
    expect(liveStreak(7, '2026-09-04', now)).toBe(7);
  });

  it('reports ZERO once a full day has been missed', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    // The real shape from production: a student 19 days deep who stopped.
    expect(liveStreak(19, '2026-09-03', now)).toBe(0);
    // And the worst one found: last logged six weeks ago, still stored as 3.
    expect(liveStreak(3, '2026-07-25', now)).toBe(0);
  });

  it('is zero when there is no streak and when there is no log at all', () => {
    const now = new Date('2026-09-05T12:00:00Z');
    expect(liveStreak(0, '2026-09-05', now)).toBe(0);
    expect(liveStreak(5, null, now)).toBe(0);
    expect(liveStreak(null, null, now)).toBe(0);
  });
});

describe('no surface reads the raw streak column', () => {
  it('routes every current_streak read through liveStreak or momentumStreak', () => {
    const offenders: string[] = [];

    for (const file of walk(SRC)) {
      const rel = file.slice(SRC.length + 1).replace(/\\/g, '/');
      if (RAW_ALLOWED[rel]) continue;
      if (rel.endsWith('.test.ts') || rel.endsWith('.test.tsx')) continue;

      const lines = readFileSync(file, 'utf8').split('\n');
      lines.forEach((line, i) => {
        if (!/\.current_streak\b/.test(line)) return;
        if (line.trimStart().startsWith('//') || line.trimStart().startsWith('*')) return;
        // A call can wrap its argument across lines, so judge a small window
        // rather than the single line the column happens to sit on.
        const window = lines.slice(Math.max(0, i - 2), i + 3).join('\n');
        if (/liveStreak\(|momentumStreak\(/.test(window)) return;
        offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
      });
    }

    expect(offenders, `Raw current_streak read — it never decays, so this shows a streak the student may no longer have. Wrap it in liveStreak(current_streak, last_log_date), or add the file to RAW_ALLOWED with a reason.\n\n${offenders.join('\n')}\n`).toEqual([]);
  });

  it('nobody reads the dead profiles.current_streak column', () => {
    // profiles.current_streak and profiles.last_log_date are 0/NULL for every
    // student — nothing has ever written them. Selecting them invites the next
    // reader to trust them (it already made every AI mentor draft open with
    // "Streak: 0 days" for students twelve days deep).
    const offenders = walk(SRC)
      .filter((f) => !/\.test\.tsx?$/.test(f))
      .filter((f) => !RAW_ALLOWED[f.slice(SRC.length + 1).replace(/\\/g, '/')])
      .filter((f) => {
        // Only a select that belongs to THIS from('profiles') call — a nearby
        // streak_data select in the same file is not an offence.
        const src = readFileSync(f, 'utf8');
        return [...src.matchAll(/from\('profiles'\)\s*\.select\(\s*'([^']*)'/g)]
          .some((m) => /\bcurrent_streak\b/.test(m[1]));
      })
      .map((f) => f.slice(SRC.length + 1));

    expect(offenders, `profiles.current_streak is dead — the real streak lives in streak_data:\n${offenders.join('\n')}`).toEqual([]);
  });
});
