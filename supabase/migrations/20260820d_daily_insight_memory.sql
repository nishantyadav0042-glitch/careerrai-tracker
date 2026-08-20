-- ── Daily-insight memory: the same observation cannot nag for a week ────────
--
-- Founder ruling (20 Aug, insight-trust review, Q3=A): once an insight is
-- shown, the SAME insight (same rule + same subject) stays quiet for 7 days
-- before it may return. The engine had no memory — "Quadratic Equations,
-- still untouched" would repeat every single day until the student acted,
-- which turns a noticing into a nag.
--
-- One row per (student, insight_key); insight_key = "<kind>:<subject>", e.g.
-- "high_weightage:Quadratic Equations". Writers: the tracker page (when the
-- card renders) and the daily-insight cron (when the push sends) — both
-- through service_role. The 'progress' fallback is exempt from suppression
-- in code (some days there is genuinely nothing new to say), but its shows
-- are still recorded here for observability.
--
-- Reversal: drop table public.daily_insight_shown; revert the code commit.

create table if not exists public.daily_insight_shown (
  student_id    uuid not null references public.profiles(id) on delete cascade,
  insight_key   text not null,
  last_shown_on date not null default (now() at time zone 'Asia/Kolkata')::date,
  primary key (student_id, insight_key)
);

alter table public.daily_insight_shown enable row level security;
revoke insert, update, delete on public.daily_insight_shown from anon, authenticated;
