-- ── A MENTOR IS NOT VISIBLE UNTIL A HUMAN APPROVES THEM ────────────────────
-- APPLIED TO PRODUCTION 5 Sep 2026.
--
-- Until now a buddy became recommendable to students on `role = 'buddy'` AND
-- `buddy_onboarding_completed = true`. Nothing else. Every credential on that
-- card — percentile, IIM converted, employer — is self-declared in the buddy's
-- own onboarding form, and nobody checked it. Three separate surfaces read
-- that state: the showcase, mentor-doors auto-assignment, and paid-session
-- assignment (which did not even exclude test accounts).
--
-- Incident #66 proved the path is reachable by accident: a phone-OTP fork
-- minted an account already carrying role='buddy', one completed wizard away
-- from a student's mentor list.
--
-- TRUST-OS: "never hand out a link we can't verify." A mentor is the largest
-- such hand-out we make.
--
-- NULL = not approved. The gate is a timestamp, never a boolean, so we always
-- know WHEN and BY WHOM — a boolean could be flipped by any future upsert
-- without a trace.
alter table profiles
  add column if not exists buddy_approved_at timestamptz,
  add column if not exists buddy_approved_by uuid references profiles(id) on delete set null;

comment on column profiles.buddy_approved_at is
  'When an admin approved this buddy to be shown/assigned to students. NULL = not approved; such a buddy must never appear in fetchEligibleBuddies or be auto-assigned by mentor-doors or session-credit. Added 5 Sep 2026 after Incident #66.';

create index if not exists profiles_buddy_approved_idx
  on profiles (role, buddy_approved_at) where role = 'buddy';

-- BACKFILL: the seven mentors recruited by the founder, live since July and
-- already carrying students (Shreya 3, Sweccha 1). Gating without this would
-- strand those students and blank the showcase. Approver stays NULL: nobody
-- clicked, this was grandfathered, and recording a fake approver would be the
-- kind of comfortable lie this column exists to prevent.
update profiles
   set buddy_approved_at = now()
 where role = 'buddy'
   and buddy_approved_at is null
   and is_test_account is not true
   and is_demo is not true
   and created_at < '2026-09-05';
