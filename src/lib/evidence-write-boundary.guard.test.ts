import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── G13-A4 (A'): evidence tables are written by the server, or not at all ───
//
// G13-A made provenance PERSISTENT. It could not make it TRUSTWORTHY, because
// an authenticated student could PATCH their own daily_reports row directly
// through PostgREST and write any column -- including study_duration (no CHECK
// at all, so 500 hours is accepted) and study_duration_source (so the client
// could stamp its own number 'credited').
//
// This guard protects the INVARIANT, not the migration text: no browser-client
// module may write these three tables. If someone later adds such a write, the
// revoke will make it fail at runtime in production -- this test is what makes
// it fail in CI instead.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = 'supabase/migrations/20260819c_evidence_tables_are_server_write_only.sql';
const EVIDENCE = ['daily_reports', 'routine_task_completions', 'topic_coverage'] as const;

/** Modules that reach the browser Supabase client, directly or by import. */
const BROWSER_MODULES = [
  'src/components/dream-colleges-card.tsx',
  'src/components/buddy-first-login-guide.tsx',
  'src/components/chat/chat-thread.tsx',
  'src/components/notification-bell.tsx',
  'src/hooks/useLogging.ts',
  'src/app/student/goal/goal-editor.tsx',
  'src/app/student/profile/history-section.tsx',
  'src/app/student/home/buddy-feedback-card.tsx',
  'src/app/student/onboarding/onboarding-modal.tsx',
  'src/app/student/onboarding/screens/screen-about-you.tsx',
  'src/app/student/analysis/mocks-section.tsx',
  'src/app/student/analysis/trends-section.tsx',
];

describe('no browser module writes an evidence table', () => {
  for (const mod of BROWSER_MODULES) {
    it(`${mod} performs no evidence write`, () => {
      const s = read(mod);
      for (const table of EVIDENCE) {
        // A write is .from('<table>') followed by a mutation before the next
        // .from(. Reads are explicitly allowed and must keep working.
        const idx = s.indexOf(`from('${table}')`);
        if (idx === -1) continue;
        const next = s.indexOf("from('", idx + 10);
        const scope = s.slice(idx, next === -1 ? undefined : next);
        expect(scope, `${mod} must not mutate ${table} from the browser`)
          .not.toMatch(/\.(insert|update|upsert|delete)\(/);
      }
    });
  }
});

describe('the two legitimate client READS survive', () => {
  it('has-logged-today still selects', () => {
    const s = read('src/hooks/useLogging.ts');
    expect(s).toMatch(/from\('daily_reports'\)[\s\S]{0,80}\.select\('id'\)/);
  });

  it('profile history still selects', () => {
    const s = read('src/app/student/profile/history-section.tsx');
    expect(s).toMatch(/from\('daily_reports'\)[\s\S]{0,120}\.select\(/);
  });
});

describe('the migration revokes writes and nothing else', () => {
  const sql = () => read(MIGRATION);
  /**
   * Statements only. A source-reading guard cannot tell SQL from commentary,
   * and a migration that explains WHY service_role is untouched necessarily
   * names it. Stripping comments is the general fix -- the alternative is a
   * migration that may not explain itself.
   */
  const statements = () => sql().split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('revokes exactly INSERT, UPDATE, DELETE on the three tables', () => {
    for (const t of EVIDENCE) {
      expect(sql()).toMatch(
        new RegExp(`REVOKE INSERT, UPDATE, DELETE ON public\\.${t}\\s+FROM anon, authenticated;`),
      );
    }
  });

  it('never revokes SELECT — two client reads depend on it', () => {
    expect(statements()).not.toMatch(/REVOKE[^;]*SELECT/i);
  });

  it('never touches service_role', () => {
    expect(statements(), 'every server write uses the service_role key').not.toMatch(/service_role/i);
  });

  it('touches no other table', () => {
    for (const forbidden of ['profiles', 'streak_data', 'student_payments', 'notifications']) {
      expect(statements(), `${forbidden} is out of scope for this gate`).not.toMatch(new RegExp(forbidden));
    }
  });

  it('changes no schema and no data', () => {
    expect(statements()).not.toMatch(/ALTER TABLE|CREATE |DROP |UPDATE |INSERT |DELETE FROM/i);
  });

  it('leaves the RLS policies in place — reads stay ownership-scoped', () => {
    expect(statements()).not.toMatch(/POLICY/i);
  });
});
