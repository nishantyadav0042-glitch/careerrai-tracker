-- ── The feedback shape the founder actually specified ───────────────────────
--
-- Two corrections to 20260824j, made before any row exists (session_feedback
-- is empty in both environments, so this is a shape change and not a
-- migration of meaning):
--
--   1. USEFULNESS is its own question. "I rated the mentor 5, the issue is
--      partly solved, and the session was only somewhat useful" are three
--      separate facts about one call. Rating measures the person, resolution
--      measures the outcome, usefulness measures the hour. Collapsing any two
--      of them loses the case worth acting on.
--
--   2. would_book_again was a boolean. A student who is unsure is not a
--      student who said no, and forcing that into false would manufacture a
--      rejection we never received. Yes / Maybe / No.

alter table public.session_feedback
  add column if not exists usefulness text,
  add column if not exists book_again text;

-- Drop the boolean only after its replacement exists. Safe: zero rows.
alter table public.session_feedback drop column if exists would_book_again;

alter table public.session_feedback drop constraint if exists session_feedback_usefulness;
alter table public.session_feedback
  add constraint session_feedback_usefulness
  check (usefulness is null or usefulness in ('very', 'useful', 'somewhat', 'not'));

alter table public.session_feedback drop constraint if exists session_feedback_book_again;
alter table public.session_feedback
  add constraint session_feedback_book_again
  check (book_again is null or book_again in ('yes', 'maybe', 'no'));

comment on column public.session_feedback.usefulness is
  'How useful the hour was — deliberately separate from rating (the person) and issue_resolved (the outcome).';
comment on column public.session_feedback.book_again is
  'yes / maybe / no. Maybe is a real answer, not a soft no.';
