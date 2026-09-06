import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * ── ONE STUDENT → MANY NOTIFICATION ENDPOINTS: THE SCHEMA CONTRACT ──────────
 *
 * 1 Sep 2026, founder decision after the reachability audit: `profiles.
 * push_subscription` is a single jsonb column, so the schema itself can hold
 * only one live device per student — a second device silently evicts the
 * first. `notification_endpoints` / `notification_deliveries`
 * (migration 20260901a) replace it with a real one-to-many registry, built
 * as Step 1 of a phased migration (schema first, additive, zero behaviour
 * change; the send path is rewired in Step 2, a separate change).
 *
 * There is no database in this test suite (vitest.config.ts: "no database,
 * no network"), so this cannot query the live schema. What it CAN do is pin
 * the migration file's contract — the same source-reading pattern this repo
 * already uses for guard tests — so a future edit can't quietly narrow
 * "many endpoints" back down to "one column" without a test going red.
 */

const MIGRATION = readFileSync(
  join(__dirname, '..', '..', 'supabase', 'migrations', '20260901a_notification_endpoint_registry.sql'),
  'utf8',
);

describe('the endpoint registry replaces one column with a real one-to-many table', () => {
  it('creates notification_endpoints, keyed to a student, not unique per student', () => {
    expect(MIGRATION).toMatch(/create table if not exists notification_endpoints/);
    expect(MIGRATION).toMatch(/student_id uuid not null references profiles\(id\)/);
    // The whole point: no `unique (student_id)` — a student may hold many rows.
    expect(MIGRATION).not.toMatch(/unique\s*\(\s*student_id\s*\)/);
  });

  it('reserves a provider column for apns, even with nothing writing it yet', () => {
    // The native iOS wrapper has no ios/ project in this repo (verified 1 Sep
    // — there is nothing to add APNs code to from here). This column existing
    // before any writer does is deliberate: the day a native app registers a
    // device token, it has schema to land in, not a second migration.
    expect(MIGRATION).toMatch(/provider text not null check \(provider in \('web_push', 'apns'\)\)/);
  });

  it('a live web_push endpoint is unique per (student, subscription url) — not per student', () => {
    expect(MIGRATION).toMatch(/notification_endpoints_unique_web_push/);
    expect(MIGRATION).toMatch(/where provider = 'web_push' and revoked_at is null/);
  });

  it('a dead endpoint is soft-revoked (a timestamp column), never DELETEd', () => {
    // sendPushToUser's old terminal-failure path did `update profiles set
    // push_subscription = null` — wiping the student's ONLY slot outright.
    // The new model must not repeat that at the row level: a dead endpoint
    // stays queryable (revoked_at set) so it can still be audited, and
    // revocation is scoped to ONE row — there is no student-level flag here
    // that could revoke every endpoint at once.
    expect(MIGRATION).toMatch(/revoked_at timestamptz/);
    expect(MIGRATION).not.toMatch(/delete from notification_endpoints/i);
  });

  it('records per-endpoint delivery evidence, separate from the per-student notifications row', () => {
    expect(MIGRATION).toMatch(/create table if not exists notification_deliveries/);
    expect(MIGRATION).toMatch(/notification_id uuid not null references notifications\(id\)/);
    expect(MIGRATION).toMatch(/endpoint_id uuid not null references notification_endpoints\(id\)/);
    // The real funnel this exists for: attempt -> provider accept -> device
    // confirm, per endpoint — not per student.
    expect(MIGRATION).toMatch(/provider_accepted_at timestamptz/);
    expect(MIGRATION).toMatch(/device_confirmed_at timestamptz/);
  });

  it('both tables are RLS-locked to the service role — no client-facing endpoint list exists', () => {
    const bothLocked =
      (MIGRATION.match(/enable row level security/g) ?? []).length >= 2
      && (MIGRATION.match(/for all using \(false\) with check \(false\)/g) ?? []).length >= 2;
    expect(bothLocked, 'both tables must deny anon/authenticated roles outright, not rely on omission').toBe(true);
  });

  it('the backfill reads platform from student_events, not guessed from push_context', () => {
    // push_context is a DISPLAY MODE (standalone/twa/ios_app/browser), not a
    // platform (android/ios/desktop) — conflating them would have mislabelled
    // every desktop and TWA row. student_events.platform (journey.ts's
    // detectPlatform()) is the only real source for it.
    expect(MIGRATION).toMatch(/last_platform as/);
    expect(MIGRATION).toMatch(/from student_events/);
  });

  it('the backfill only carries forward LIVE subscriptions — not dead ones', () => {
    expect(MIGRATION).toMatch(/where p\.push_subscription is not null\s*\n\s*and p\.push_died_at is null/);
  });
});
