/**
 * ── THE DAY-1 → DAY-2 BRIDGE: what must stay true in the source ────────────
 *
 * Mission of 22 Sep 2026 (docs/CAREERRAI_DAY1_DAY2_AUTONOMOUS_MISSION.md).
 * Each block below pins one change that was made because production evidence
 * said so; each records the evidence so a future edit that undoes it does so
 * knowingly. These are greps of the source, so they say "the code still does
 * x", never "x works" — the behaviour tests live beside the pure modules.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from './test-support/code-only';
import { displayColumns } from './notification-endpoints';

const root = join(__dirname, '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');
const code = (p: string) => codeOnly(read(p));

describe('reschedule Save no longer reloads the page', () => {
  const src = code('src/components/home/pace-card.tsx');

  it('does not call window.location.reload()', () => {
    // One repeat student: reschedule → Save eight times in thirty minutes,
    // each Save a full reload that re-armed the push ask and re-mounted the
    // tracker. The reload is the established part; it is gone.
    expect(src).not.toMatch(/window\.location\.reload\(/);
  });

  it('refreshes the server-rendered numbers state-preservingly, inside a transition', () => {
    expect(src).toMatch(/useRouter\(\)/);
    expect(src).toMatch(/startRefresh\(\(\) => \{ router\.refresh\(\); \}\)/);
    expect(src).toMatch(/useTransition\(\)/);
  });

  it('tells the plan card the day may have been rebuilt', () => {
    expect(src).toContain("new Event('cr-routine-updated')");
    // …and the plan card really listens for that name.
    expect(code('src/components/DailyTracker/TodaysRoutineCard.tsx')).toContain("addEventListener('cr-routine-updated'");
  });

  it('shows the chosen date the moment the save succeeds', () => {
    expect(src).toMatch(/const targetIso = savedTargetIso \?\? serverTargetIso;/);
    expect(src).toMatch(/if \(date\) setSavedTargetIso\(date\);/);
  });
});

describe('the push ask\'s Later persists until a real re-entry', () => {
  const src = code('src/components/standalone-notif-ask.tsx');

  it('Later writes the snooze', () => {
    expect(src).toMatch(/function later\(\)[\s\S]*?snoozeLater\(store, Date\.now\(\)\)/);
  });

  it('evaluate() skips while snoozed and says so', () => {
    expect(src).toContain("report('skipped', 'later_snoozed')");
  });

  it('only a re-entry (REENTRY_GAP_MS away) clears the snooze', () => {
    expect(src).toMatch(/if \(isReentry\(hiddenMs\)\) \{ const store = snoozeStore\(\); if \(store\) clearSnooze\(store\); \}/);
  });

  it('a student with push already on is untouched — the early return still comes first', () => {
    const early = src.indexOf('if (pushEnabled && !serverSubDead)');
    const snooze = src.indexOf('laterSnoozed(store)');
    expect(early).toBeGreaterThan(-1);
    expect(snooze).toBeGreaterThan(early);
  });
});

describe('the journey tracker writes the bridge signals', () => {
  const tracker = code('src/components/journey-tracker.tsx');
  const journey = read('src/lib/journey.ts');

  it('app_open carries session_new and launch', () => {
    expect(tracker).toMatch(/track\('app_open', \{[\s\S]*?launch, session_new: sessionIsNew\(\),/);
  });

  it('app_resume fires only after a re-entry gap, with how long away and the door', () => {
    expect(tracker).toMatch(/if \(!isReentry\(hiddenMs\)\) return;/);
    expect(tracker).toMatch(/track\('app_resume', \{ hidden_ms: hiddenMs, launch: door/);
  });

  it('both names are registered, so a typo cannot mint a metric', () => {
    expect(journey).toContain("| 'app_resume'");
    expect(journey).toContain("| 'app_open'");
  });

  it('app_resume is not on any retention sweep list', () => {
    // Default is KEEP: only names written into WRITE_ONLY_EVENTS or
    // SCREEN_EVENTS are ever deleted. The bridge reads app_resume for life.
    const retention = code('src/lib/telemetry-retention.ts');
    expect(retention).not.toContain("'app_resume'");
  });

  it('the ask and the tracker share one definition of "away"', () => {
    expect(tracker).toContain("from '@/lib/session-boundary'");
    expect(code('src/components/standalone-notif-ask.tsx')).toContain("from '@/lib/session-boundary'");
  });
});

describe('every tap on the Blueprint has a stable name', () => {
  it('PlanRow demands one and passes it to autocapture', () => {
    const src = code('src/app/student/blueprint/page.tsx');
    expect(src).toMatch(/function PlanRow\([\s\S]{0,240}?analytics: string/);
    expect(src).toContain('data-analytics={analytics}');
    // Every use names its row.
    const uses = src.match(/<PlanRow[\s\S]*?\/>/g) ?? [];
    expect(uses.length).toBeGreaterThan(3);
    for (const u of uses) expect(u, u).toMatch(/analytics="plan_row_[a-z_]+"/);
  });

  it('icon-only back links are named, not recorded as "a"', () => {
    for (const p of [
      'src/app/student/blueprint/page.tsx',
      'src/app/student/plan/topics/page.tsx',
      'src/app/student/analysis/page.tsx',
      'src/app/student/goal/goal-editor.tsx',
    ]) {
      expect(code(p), p).toMatch(/<Link href="\/student\/(tracker|blueprint)" data-analytics="back_to_(tracker|blueprint)" aria-label=/);
    }
  });

  it('the coverage button has ONE tap producer', () => {
    const src = code('src/components/update-coverage-button.tsx');
    expect(src).not.toContain("track('tap'");
    expect(src).toContain('data-analytics="update_coverage_on_demand"');
  });
});

describe('the display-status vocabulary is one rule in two places, tied (Incident #104)', () => {
  // Statements only: the file's comments quote the OLD vocabulary and the
  // words "update"/"delete" while explaining why, and prose must never
  // answer a structural question (see test-support/code-only.ts).
  const sql = read('supabase/migrations/20260923a_display_status_vocabulary.sql')
    .split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('the constraint names exactly what displayColumns() writes', () => {
    const now = '2026-09-23T00:00:00.000Z';
    const written = new Set([
      displayColumns({ attempted: true, resolved: true, error: null }, now).display_status,
      displayColumns({ attempted: true, resolved: false, error: 'x' }, now).display_status,
      displayColumns({ attempted: false, resolved: false, error: null }, now).display_status,
    ]);
    const m = sql.match(/display_status in \(([^)]+)\)\)/);
    expect(m, 'the migration must state the vocabulary in one IN (...) list').not.toBeNull();
    const allowed = new Set(m![1].split(',').map((s) => s.trim().replace(/'/g, '')));
    expect(allowed).toEqual(written);
  });

  it('replaces the old constraint rather than adding a second', () => {
    expect(sql).toMatch(/drop constraint if exists notification_deliveries_display_status_chk/);
    expect(sql).toMatch(/add constraint notification_deliveries_display_status_chk/);
    expect(sql, 'no data is touched').not.toMatch(/\bupdate\b|\bdelete\b|drop column/i);
  });

  it('confirmDelivery no longer swallows a refused write', () => {
    const src = code('src/lib/notification-endpoints.ts');
    expect(src).toMatch(/error: updateErr \}/);
    expect(src).toMatch(/if \(updateErr\) console\.error/);
    expect(src).toMatch(/if \(displayErr\) console\.error/);
    expect(src).toMatch(/if \(upsertErr\) console\.error/);
  });
});
