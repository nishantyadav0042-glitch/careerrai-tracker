import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tallySubmission } from './community-pipeline';

// ── "No threshold. Ever." — the guard ───────────────────────────────────────
//
// Founder, 29 Jul: "Don't set a bar. Maximum votes gets the top position."
// Founder, 7 Aug, after finding the dashboard still saying "needs N more
// votes": "I told you there is no cap."
//
// The bars model (MIN_VOTES_TO_JUDGE=5, FEATURE_BAR=85%, ARCHIVE_BAR=65%,
// gradeSubmission) was removed from the pick on 29 Jul but survived in THREE
// other places — the recycle engine, the founder dashboard, the challenges
// admin — because killing a rule in one file is not killing the rule. This
// test greps the tree so the model cannot be reintroduced anywhere without
// failing CI by name.

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, out);
    else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.tsx?$/.test(entry)) out.push(full);
  }
  return out;
}

describe('votes order the queue, they never gate it', () => {
  it('no source file resurrects the vote-bars model', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles('src')) {
      const text = readFileSync(file, 'utf8');
      for (const [i, line] of text.split('\n').entries()) {
        if (/MIN_VOTES_TO_JUDGE|FEATURE_BAR|ARCHIVE_BAR|gradeSubmission/.test(line)) {
          offenders.push(`${file}:${i + 1}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it('tallySubmission describes votes without judging them', () => {
    // One vote is enough for a percentage — there is no floor below which the
    // number is withheld. Only a literal 0/0 has no percentage to show.
    expect(tallySubmission(1, 0)).toEqual({ total: 1, helpfulPct: 100 });
    expect(tallySubmission(0, 1)).toEqual({ total: 1, helpfulPct: 0 });
    expect(tallySubmission(3, 1)).toEqual({ total: 4, helpfulPct: 75 });
    expect(tallySubmission(0, 0)).toEqual({ total: 0, helpfulPct: null });
    // And it returns no verdict field at all — nothing downstream can branch
    // on a judgment that no longer exists.
    expect(Object.keys(tallySubmission(5, 0)).sort()).toEqual(['helpfulPct', 'total']);
  });
});
