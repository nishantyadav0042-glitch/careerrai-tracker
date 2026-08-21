import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { SUBMISSION_STATUSES, VISIBLE_STATUSES } from './community-pipeline';

// ── Everything a student can see, a student can vote on ────────────────────
//
// 20 Aug, found by production forensic. The feed selected
// ['voting','featured','archived']; /api/community/vote accepted only
// 'voting' (inside a 72h window) and 'featured'. In production that meant 40
// of the 60 items in the feed — 5 of the first 8 cards — answered a vote tap
// with 400 "Voting is closed for this one", and the optimistic vote vanished
// from the screen. The founder's report, "students are coming but their votes
// are not being counted", was literally true.
//
// The root cause was two generations of the same product sharing one table: a
// dead moderation queue (pending → approved, MCQ payload, 0 rows) and a
// ballot rotation (voting → archived, free-text payload, all 88 rows). The
// feed spoke one dialect, the vote route the other.
//
// The invariant that replaces them: ONE live pool. A live item is visible and
// votable, permanently. Only the TOP PLACEMENT is a single day, and that is
// featured_on — a different mechanism, deliberately untouched.

const read = (p: string) => readFileSync(p, 'utf8');

/** Source with comments removed. Guards that read raw text keep tripping on
 *  their own explanations — and worse, a banned string sitting in a comment
 *  can make a guard look satisfied. Test the CODE. */
const code = (p: string) =>
  read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const MIGRATION = 'supabase/migrations/20260820e_community_one_live_pool.sql';

const READ_PATHS = [
  'src/app/api/community/insights/route.ts',
];

describe('one vocabulary, and the database enforces it', () => {
  it('the code list matches the DB CHECK exactly', () => {
    const sql = read(MIGRATION);
    for (const s of SUBMISSION_STATUSES) {
      expect(sql, `${s} missing from the CHECK constraint`).toContain(`'${s}'`);
    }
    // The retired ballot words must not be in the constraint.
    const check = sql.slice(sql.indexOf('add constraint student_submissions_status_check'));
    for (const dead of ["'voting'", "'archived'", "'featured'", "'approved'"]) {
      expect(check, `${dead} is a retired status and cannot be legal again`).not.toContain(dead);
    }
  });

  it('only live content is visible', () => {
    expect(VISIBLE_STATUSES).toEqual(['live']);
  });
});

describe('what the student sees, the student can vote on', () => {
  it.each(READ_PATHS)('%s serves only live items', (file) => {
    const s = code(file);
    expect(s).toContain("eq('status', 'live')");
    // featured_on (the one-day top slot) is a different mechanism and stays;
    // what must not return is a STATUS filter naming the retired pool.
    expect(s, 'the retired ballot pool must not be read again')
      .not.toMatch(/status[^\n]*(archived|'featured')/);
    expect(s, 'no multi-status pool filter').not.toMatch(/in\('status'/);
  });

  it('the vote route accepts exactly that same set', () => {
    const s = code('src/app/api/community/vote/route.ts');
    expect(s).toContain("sub.status !== 'live'");
    // The window check is what closed voting on a live item.
    expect(s, 'the 72h ballot window must not come back').not.toContain('voting_ends_at');
  });

  it('nothing writes a ballot window any more', () => {
    for (const f of ['src/app/api/community/submit/route.ts', 'src/lib/community-pipeline.ts']) {
      expect(code(f), `${f} still writes a voting window`).not.toContain('VOTING_WINDOW_HOURS');
    }
    expect(read('src/app/api/community/submit/route.ts')).toContain("'pending' : 'live'");
  });

  it('the ballot module is gone, not merely unused', () => {
    expect(existsSync('src/lib/community-recycle.ts'),
      'community-recycle.ts revived the archived pool — it has no job now').toBe(false);
  });
});

// The guard that would have caught the three regressions below. The first
// version of this file hand-listed two routes and pinned those; three OTHER
// files kept reading the retired statuses and each broke something real:
//   /api/community/report      — the Play-required "this shouldn't be here"
//                                button returned 400 on EVERY card
//   /api/community/daily-slot  — the community slot could never be offered
//   /api/admin/launch-metrics  — the active-pool count was always zero
// A guard that names files only protects the files it names. This one sweeps
// the whole tree, so the NEXT vocabulary change cannot leave a reader behind.
describe('no reader anywhere still speaks the retired vocabulary', () => {
  const RETIRED = ["'voting'", "'archived'", "'featured'", "voting_ends_at"];

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((e) => {
      const p = join(dir, e);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.tsx?$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
    });
  }

  it('sweeps every source file, not a hand-picked list', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const src = code(file);
      // featured_on is a DIFFERENT column (the one-day top slot) and stays.
      const stripped = src.replace(/featured_on/g, '');
      const hits = RETIRED.filter((w) => stripped.includes(w));
      if (hits.length) offenders.push(`${file} ${hits.join(',')}`);
    }
    expect(offenders, 'these still read a status the DB CHECK rejects').toEqual([]);
  });
});

describe('permanent content, one-day top placement', () => {
  it('the daily rotation is kept whole — it already IS the founder rule', () => {
    // One item per kind holds the slot for exactly one day, never repeats
    // while fresh stock exists, no vote threshold, zero votes is not a
    // blocker. That engine predates this change and survives it intact.
    const pick = read('src/lib/daily-pick.ts');
    expect(pick).toContain('featuredOn');
    expect(read('src/lib/daily-pick-runner.ts')).toContain("ELIGIBLE_STATUSES = ['live']");
  });

  it('the cron still promotes a daily winner', () => {
    const cron = code('src/app/api/cron/community-recycle/route.ts');
    expect(cron).toContain('promoteDailyPick');
    expect(cron, 'the retired recycle must not be called').not.toContain('recycleCommunityPool');
  });
});
