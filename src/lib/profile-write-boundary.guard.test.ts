import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// ── G13-A4 (B'): a client cannot write its own authorization ────────────────
//
// resolvePair() is the authorization for every chat route, and for a student it
// reads profiles.buddy_id -- a column the client could write. There is no check
// that the mentor accepted, that a payment exists, or that an admin assigned
// it. A student could set buddy_id to any mentor's uuid (mentor uuids are shown
// to unpaid students by design) and open a chat with a real IIM mentor they
// never paid for, bypassing the five-students-per-mentor cap. is_premium and
// the subscription columns were self-grantable the same way.
//
// This guard protects the INVARIANT: no browser module may write a protected
// column. The migration stops it at the database; this stops it in CI, where
// the failure is cheap.

const read = (p: string) => readFileSync(join(process.cwd(), p), 'utf8');
const MIGRATION = 'supabase/migrations/20260819d_profiles_protected_columns.sql';

const PROTECTED = [
  'id', 'role', 'buddy_id',
  'is_premium', 'subscription_status', 'subscription_plan', 'subscription_renews_at',
  'agreed_monthly_payout', 'is_test_account', 'created_at',
] as const;

/** Every module that reaches the browser Supabase client. */
const BROWSER_MODULES = [
  'src/components/dream-colleges-card.tsx',
  'src/components/buddy-first-login-guide.tsx',
  'src/app/student/goal/goal-editor.tsx',
  'src/app/student/onboarding/onboarding-modal.tsx',
  'src/app/student/onboarding/screens/screen-about-you.tsx',
  'src/app/buddy/setup/setup-form-client.tsx',
  'src/app/buddy/(dashboard)/settings/page.tsx',
  'src/app/buddy/(dashboard)/home/buddy-triage-view.tsx',
];

describe('no browser module writes a protected column', () => {
  for (const mod of BROWSER_MODULES) {
    it(`${mod} writes no protected column`, () => {
      const src = read(mod);
      // Only look inside profiles update payloads.
      for (const m of src.matchAll(/from\('profiles'\)[\s\S]{0,120}?\.update\(([\s\S]{0,1400}?)\)\s*\n?\s*\.eq\(/g)) {
        const payload = m[1];
        for (const col of PROTECTED) {
          expect(payload, `${mod} must not set ${col} from the browser`)
            .not.toMatch(new RegExp(`(^|[^a-z_])${col}\\s*:`));
        }
      }
    });
  }
});

describe('the legitimate client writes are preserved', () => {
  it('dream colleges', () => {
    expect(read('src/components/dream-colleges-card.tsx')).toMatch(/update\(\{ dream_colleges/);
  });
  it('buddy tour flag', () => {
    expect(read('src/components/buddy-first-login-guide.tsx')).toMatch(/buddy_tour_completed: true/);
  });
  it('goal editor hours and target', () => {
    expect(read('src/app/student/goal/goal-editor.tsx')).toMatch(/target_percentile: targetPercentile/);
  });
  it('onboarding completion', () => {
    expect(read('src/app/student/onboarding/onboarding-modal.tsx')).toMatch(/onboarding_completed: true/);
  });
  it('buddy setup profile', () => {
    expect(read('src/app/buddy/setup/setup-form-client.tsx')).toMatch(/buddy_onboarding_completed: true/);
  });
  it('phone stays writable — onboarding writes it', () => {
    // Deliberately NOT protected. Noted in the migration: admin/allowlist
    // matches BY phone, which is an indirect path needing an admin-flow
    // decision rather than a permission change.
    expect(PROTECTED as readonly string[]).not.toContain('phone');
  });
});

describe('the migration is an allow-list by subtraction', () => {
  const sql = () => read(MIGRATION);
  const statements = () => sql().split('\n').filter((l) => !l.trim().startsWith('--')).join('\n');

  it('revokes the table-wide UPDATE first', () => {
    expect(statements()).toMatch(/REVOKE UPDATE ON public\.profiles FROM anon, authenticated;/);
  });

  it('re-grants every column EXCEPT the protected set', () => {
    const s = statements();
    expect(s, 'the grant must be generated, not hand-listed').toMatch(/column_name NOT IN \(/);
    expect(s).toMatch(/GRANT UPDATE \(%s\) ON public\.profiles TO authenticated/);
    for (const col of PROTECTED) {
      expect(s, `${col} must be in the protected set`).toMatch(new RegExp(`'${col}'`));
    }
  });

  it('never revokes SELECT — the app reads profiles everywhere', () => {
    expect(statements()).not.toMatch(/REVOKE[^;]*SELECT[^;]*profiles/i);
  });

  it('closes streak_data, which has no client writer at all', () => {
    expect(statements()).toMatch(/REVOKE INSERT, UPDATE, DELETE ON public\.streak_data FROM anon, authenticated;/);
  });

  it('does not touch resolvePair, the queue, or any assignment', () => {
    const s = statements();
    for (const forbidden of ['buddy_assignment_queue', 'resolvePair', 'student_payments']) {
      expect(s, `${forbidden} is out of scope`).not.toMatch(new RegExp(forbidden));
    }
  });

  it('changes no schema and no data', () => {
    expect(statements()).not.toMatch(/ALTER TABLE|CREATE TABLE|DROP |UPDATE public|INSERT INTO|DELETE FROM/i);
  });

  it('leaves the RLS policies alone — row scoping still comes from them', () => {
    expect(statements()).not.toMatch(/POLICY/i);
  });
});

describe('resolvePair is deliberately unchanged', () => {
  it('still reads buddy_id — it stops being writable, not authoritative', () => {
    const s = read('src/lib/chat.ts');
    expect(s).toMatch(/if \(!me\.buddy_id\) return null;/);
    expect(s).toMatch(/return \{ studentId: me\.id, buddyId: me\.buddy_id \}/);
  });
});
