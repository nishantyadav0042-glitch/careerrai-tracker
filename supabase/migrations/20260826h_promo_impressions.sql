-- ── ONE buddy pitch per student per study day — as a ROW, not a memory ──────
--
-- Founder, 26 Aug: one buy-buddy pitch per student per day — open the app
-- ten times, on any screen, still exactly one. One pitch per student per day,
-- TOTAL, across every channel — the modal, the evening notification,
-- everything.
--
-- WHY A TABLE AND NOT localStorage. The audit measured the old throttle:
-- per-browser (second device = second pitch), and `catch { return true }` —
-- storage blocked means the nudge shows on EVERY open. Fail-open, on the one
-- surface the founder explicitly capped. A UNIQUE index cannot be defeated by
-- a second device, a cleared cache, or a storage exception, and when the
-- claim cannot be made the answer is "don't show" — fail CLOSED.
--
-- WHY NOT reuse notifications_once_per_day_per_type: that index hardcodes its
-- 21 types inside the predicate (adding one = drop + recreate a production
-- index), it caps per CHANNEL not per student-across-channels, and coupling
-- the modal to the notifications table would mean a sent notification and a
-- shown modal silently fight over one row that means two different things.
-- Separate authority, same proven shape.
--
-- THE DAY is the STUDY day — 05:30 IST rollover (lib/study-day.ts), not the
-- calendar midnight the notifications index uses. The pitch follows the
-- student's day: someone on the app at 2 AM is finishing yesterday, and
-- yesterday's pitch already happened. The generated column makes the day part
-- of the ROW, so the uniqueness cannot drift from the definition. 05:30 IST
-- is exactly 00:00 UTC, so the expression is a plain UTC date — immutable,
-- index-safe, and identical to studyDayString() by construction.
--
-- promo_type is TEXT with a check, not an enum: the founder's rule today
-- covers one promo. When a second kind of promo earns its own cap it gets its
-- own row in the check — a deliberate edit, reviewed, like the guard has been.

create table if not exists public.promo_impressions (
  student_id  uuid not null references public.profiles(id) on delete cascade,
  promo_type  text not null check (promo_type in ('buddy_pitch')),
  shown_at    timestamptz not null default now(),
  -- 05:30 IST rollover == 00:00 UTC: the UTC date IS the study day.
  study_day   date not null generated always as ((shown_at at time zone 'UTC')::date) stored,
  channel     text not null check (channel in ('modal', 'notification', 'onboarding')),
  primary key (student_id, promo_type, study_day)
);

comment on table public.promo_impressions is
  'One row = one commercial pitch shown to one student on one study day. The primary key IS the frequency cap.';
comment on column public.promo_impressions.channel is
  'Which surface won the day. Informational — the cap does not care which channel it was.';

-- The claim: INSERT and let the primary key answer. 23505 = already pitched
-- today. Locked to service_role like every session RPC — the roles are NAMED,
-- because `from public` alone does not revoke Supabase's explicit grants
-- (Incident #33).
alter table public.promo_impressions enable row level security;
revoke all on table public.promo_impressions from public, anon, authenticated;
grant all on table public.promo_impressions to service_role;
