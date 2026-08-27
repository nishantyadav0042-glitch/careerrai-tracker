import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { STUDENT_BUDGET_TYPES } from './notification-os';

// ── The budget list and the database backstop must not drift ───────────────
//
// supabase/migrations/20260816_notification_reliability_v2.sql says:
//
//     "KEEP THIS LIST IN SYNC WITH notification-os.ts's STUDENT_BUDGET_TYPES
//      — src/lib/notification-os.test.ts asserts the two match."
//
// That assertion did not exist. The lists had drifted to 27 vs 21, and the
// six types with no database backstop were relying entirely on a hand-rolled
// "did I already send this?" read inside their cron — several of which fail
// OPEN. One of the six, founder_ping, is scheduled by BOTH Vercel and the
// GitHub fallback, so its only protection against a double send was a single
// unchecked query.
//
// This is the missing test. It does not force the two lists to be identical —
// there are defensible reasons for a type to be budgeted but not indexed —
// but every difference must be DECLARED here, so drift becomes a deliberate
// act with a reason attached instead of something nobody notices.

const MIGRATIONS = 'supabase/migrations';

/**
 * Types that are budgeted but deliberately have no once-per-day unique index.
 * Each needs its own dedup, and that dedup must fail CLOSED — with no DB
 * backstop, a fail-open read is the whole protection gone.
 */
const BUDGETED_BUT_NOT_INDEXED: Record<string, string> = {
  daily_insight: 'daily_insight_shown is its authority (20260820d) — a separate table, not this index.',
  founder_ping: 'Weekly, not daily; a per-day index cannot express a 6-day window. Cron read must fail closed.',
  timetable_refresh: '10-day window, not per-day.',
  plan_extended: 'plan_extensions PK (student, week) is its authority.',
  whatsapp_backfill: 'All-time once-ever, not per-day.',
  onboarding_done: 'Fires once per student lifetime, at signup.',
};

/** Pull the type list out of the index definition in the migrations. */
function indexedTypes(): string[] {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files.reverse()) {
    const sql = readFileSync(join(MIGRATIONS, f), 'utf8');
    const m = sql.match(/notifications_once_per_day_per_type[\s\S]*?type\s*=\s*ANY\s*\(\s*ARRAY\s*\[([\s\S]*?)\]/);
    if (!m) continue;
    const types = [...m[1].matchAll(/'([a-z_]+)'/g)].map((x) => x[1]);
    if (types.length) return types;
  }
  return [];
}

describe('STUDENT_BUDGET_TYPES ↔ notifications_once_per_day_per_type', () => {
  const indexed = indexedTypes();

  it('the index definition is findable in the migrations', () => {
    expect(indexed.length, 'Could not parse notifications_once_per_day_per_type out of any migration.').toBeGreaterThan(0);
  });

  it('every budgeted type is either indexed or has a declared reason not to be', () => {
    const budgeted = STUDENT_BUDGET_TYPES.filter((t) => !t.startsWith('brain_'));
    const undeclared = budgeted.filter((t) => !indexed.includes(t) && !(t in BUDGETED_BUT_NOT_INDEXED));
    expect(
      undeclared,
      'These types count against the daily budget but have NO database backstop and no declared reason. ' +
      'Their only protection is a hand-rolled read inside their cron — and both schedulers fire. ' +
      'Either add them to the index in a migration, or declare why not in BUDGETED_BUT_NOT_INDEXED:\n  ' +
      undeclared.join('\n  '),
    ).toEqual([]);
  });

  it('every indexed type is still a real budgeted type — no orphan index entries', () => {
    const orphans = indexed.filter((t) => !STUDENT_BUDGET_TYPES.includes(t));
    expect(
      orphans,
      'The index constrains types the budget list no longer knows about. One of the two moved without the other:\n  ' +
      orphans.join('\n  '),
    ).toEqual([]);
  });

  it('the declared-exception list contains no stale entry', () => {
    const stale = Object.keys(BUDGETED_BUT_NOT_INDEXED)
      .filter((t) => indexed.includes(t) || !STUDENT_BUDGET_TYPES.includes(t));
    expect(stale, `Now indexed, or no longer budgeted — remove from the exception list:\n  ${stale.join('\n  ')}`).toEqual([]);
  });
});
