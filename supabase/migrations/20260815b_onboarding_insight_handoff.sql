-- The Insight→Plan handoff (Preparation Insight Engine final spec, Part J;
-- founder, 15 Aug: "Instant Insight can now be correct, but the student can
-- still experience two different CareerRai truths immediately afterward.").
--
-- Nothing in this codebase previously persisted WHICH insight a student was
-- actually shown at signup (forensic audit, Part L #11: "no analytics/
-- telemetry records which specific insight a student saw"). Without that
-- record, nothing after signup can know what the student was told, so the
-- real plan (resolveFocusSections) and the pre-signup Instant Insight screen
-- could silently disagree with no way to explain the difference.
--
-- NAMED `onboarding_insight_*`, not `instant_insight_*` — a naming question
-- worth answering explicitly rather than leaving implicit (founder, 15 Aug
-- pre-commit review): this is traced to exactly ONE write, at signup, from
-- the ONE-TIME pre-signup/first-login Instant Insight screen. No cron, no
-- daily recompute, no second write path anywhere in the codebase re-derives
-- or updates it — computePrepInsight() has exactly one caller
-- (screen-instant-insight.tsx), used only in the two onboarding funnels. A
-- name built on "instant_insight" ties the column to the SCREEN's current
-- name, which invites a future engineer to assume it tracks "whatever the
-- student's current diagnosis is" and start updating it from some later
-- feature (a daily insight, a recompute) — which would be wrong: this is a
-- historical snapshot of what onboarding showed, not a live/canonical field.
-- If a future feature needs a CURRENT, possibly-changing diagnosis, that is
-- a different concept and belongs in a different, explicitly-named place
-- (or a real history table, if multiple snapshots over time are ever
-- needed) — not a reuse of these columns.
--
-- Five small, nullable columns on `profiles`, matching the existing
-- self_reported_weakest_section convention exactly (a profile-level,
-- onboarding-captured snapshot, not a new table) — this is genuinely new
-- information (never persisted anywhere before), but the STORAGE SHAPE is
-- not: same table, same nullable-text pattern, same one-time-onboarding-
-- write model.
--
-- Deliberately NOT storing a computed "aligned/different" verdict — that is
-- a comparison against whatever the plan resolves TODAY, which changes day
-- to day, so it is computed on demand (src/lib/insight-plan-handoff.ts),
-- never cached here.

alter table public.profiles
  add column if not exists onboarding_insight_section text,
  add column if not exists onboarding_insight_topic text,
  add column if not exists onboarding_insight_source text,
  add column if not exists onboarding_insight_root_cause text,
  add column if not exists onboarding_insight_recommend text;

alter table public.profiles
  add constraint onboarding_insight_section_valid
  check (onboarding_insight_section is null or onboarding_insight_section in ('VARC', 'DILR', 'QA'));

alter table public.profiles
  add constraint onboarding_insight_source_valid
  check (onboarding_insight_source is null or onboarding_insight_source in ('student', 'careerrai'));
