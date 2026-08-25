-- ── Why they bought, and whether it worked ──────────────────────────────────
--
-- TRACK B (intent) and TRACK D (feedback) are the two ends of the same
-- question. Together they turn a ₹299 transaction into a learning loop:
--
--   what the student SAID they needed → the session → what they SAID happened
--
-- ── RECON FINDING THAT SHAPED B ────────────────────────────────────────────
-- The reason for purchase has NEVER been recorded. /api/sessions/book accepts
-- finding_kind in its body and uses it to match a mentor, but
-- student_payments has NO finding_kind column — while PayableRow declares it
-- optional, so `row.finding_kind` silently reads undefined and every credit is
-- minted with finding_kind = null. Both production credits confirm it.
--
-- ── ONE VOCABULARY, TWO PROVENANCES ────────────────────────────────────────
-- finding_kind is what the PRODUCT observed (mock_plateau, no_strategy…).
-- Session intent is what the STUDENT says they want. These are different
-- FACTS and must not be conflated — but they are the same KIND of fact, so
-- they share one vocabulary rather than forking a second taxonomy. This is the
-- same observed/self-reported split the sales work already established.

-- ── B0. Schema parity ──────────────────────────────────────────────────────
-- Fourth and fifth divergences found today: video_sessions and mentor_grants
-- carry PRIMARY KEYs in production and none in test, so the foreign keys below
-- applied cleanly to production and failed on test. The pattern is systemic —
-- the test database was built from an incomplete migration history — and every
-- probe run against it is only as trustworthy as the constraints it happens to
-- share with production.
--
-- Declared here so the repo can rebuild them. Idempotent against production.
do $$
declare t text;
begin
  foreach t in array array['video_sessions', 'mentor_grants', 'session_credits'] loop
    if not exists (
      select 1 from pg_constraint
       where conrelid = ('public.' || t)::regclass and contype = 'p'
    ) then
      execute format('alter table public.%I add primary key (id)', t);
    end if;
  end loop;
end $$;

-- ── B1. The vocabulary, extended not forked ────────────────────────────────
-- The existing six kinds all survive. The additions are the ones a student
-- would actually say and the product cannot infer: which section hurts, and
-- whether their coaching timetable is fighting the plan.
create table if not exists public.session_intents (
  kind text primary key,
  label text not null,
  -- Which mentor speciality answers it. Mirrors FINDING_TO_SPECIALITY, whose
  -- 'section_depth' already existed and is exactly the answer to a section
  -- weakness — evidence that extending was right and forking would have been
  -- duplication.
  speciality text not null,
  -- Student-choosable at booking. Product-only findings stay in the table so
  -- one vocabulary covers both provenances, but are not offered as choices.
  selectable boolean not null default true,
  sort_order smallint not null default 100
);

insert into public.session_intents (kind, label, speciality, selectable, sort_order) values
  ('no_strategy',        'Overall CAT strategy / study plan',        'strategy',       true,  10),
  ('varc_weak',          'VARC is my weak area',                     'section_depth',  true,  20),
  ('dilr_weak',          'DILR is my weak area',                     'section_depth',  true,  30),
  ('qa_weak',            'QA is my weak area',                       'section_depth',  true,  40),
  ('mock_performance',   'My mock / test performance',               'mock_analysis',  true,  50),
  ('time_management',    'Time management',                          'strategy',       true,  60),
  ('consistency',        'Consistency / daily routine',              'consistency',    true,  70),
  ('coaching_conflict',  'My coaching timetable clashes with my plan','strategy',      true,  80),
  ('interview_prep',     'College / IIM interview preparation',      'second_attempt', true,  90),
  ('other',              'Something else',                           'strategy',       true, 999),
  -- Product-observed findings. Same vocabulary, not offered as a choice.
  ('mock_plateau',       'Mock scores have plateaued',               'mock_analysis',  false, 100),
  ('mock_drop',          'Mock scores dropped',                      'mock_analysis',  false, 101),
  ('behind_timeline',    'Behind the syllabus timeline',             'strategy',       false, 102),
  ('repeating_pattern',  'Repeating a past pattern',                 'second_attempt', false, 103),
  ('unreviewed',         'Not yet reviewed',                         'strategy',       false, 104)
on conflict (kind) do update
  set label = excluded.label, speciality = excluded.speciality,
      selectable = excluded.selectable, sort_order = excluded.sort_order;

-- ── B2. Carry the intent from booking to credit ────────────────────────────
-- The credit is minted by the verified webhook, so the intent must ride on the
-- payment row — the only thing that survives the round trip through Razorpay.
alter table public.student_payments
  add column if not exists session_intent text references public.session_intents(kind),
  add column if not exists session_intent_note text,
  -- The product's own diagnosis at time of purchase. Declared at last: the
  -- code has been reading it for weeks from a column that did not exist.
  add column if not exists finding_kind text,
  add column if not exists finding_evidence text;

alter table public.session_credits
  add column if not exists session_intent text references public.session_intents(kind),
  add column if not exists session_intent_note text;

-- 'Something else' with no explanation teaches nothing, and it is the option a
-- student picks when none of ours fit — precisely the case worth reading.
-- Same rule the intervention ledger already enforces for reason_category.
alter table public.student_payments drop constraint if exists student_payments_other_needs_note;
alter table public.student_payments
  add constraint student_payments_other_needs_note
  check (session_intent is distinct from 'other'
         or (session_intent_note is not null and length(btrim(session_intent_note)) >= 3));

alter table public.session_credits drop constraint if exists session_credits_other_needs_note;
alter table public.session_credits
  add constraint session_credits_other_needs_note
  check (session_intent is distinct from 'other'
         or (session_intent_note is not null and length(btrim(session_intent_note)) >= 3));

create index if not exists session_credits_intent_idx
  on public.session_credits (session_intent) where session_intent is not null;

-- ── D. Student feedback on the session ─────────────────────────────────────
--
-- A NEW authority, deliberately. buddy_feedback is the mentor writing about
-- the STUDENT — the opposite direction. rating_prompts is the App Store ask.
-- Neither can carry this, and overloading either would corrupt an existing
-- meaning.
create table if not exists public.session_feedback (
  id bigserial primary key,
  -- ONE feedback per session. A second submission is an edit, never a second
  -- vote — otherwise an average is trivially stuffable.
  video_session_id uuid not null unique references public.video_sessions(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  buddy_id uuid not null references public.profiles(id) on delete cascade,

  -- The three questions kept deliberately separate. A student can rate a
  -- mentor highly and still say the problem is unsolved, and collapsing those
  -- into one score would hide exactly the case worth acting on.
  rating smallint not null,
  issue_resolved text not null,
  would_book_again boolean,

  -- Carried from the credit so a report can ask "which intents end resolved?"
  -- without a join through payment.
  session_intent text references public.session_intents(kind),

  what_helped text,
  what_was_missing text,

  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),

  constraint session_feedback_rating_range check (rating between 1 and 5),
  constraint session_feedback_resolution check (issue_resolved in ('fully', 'partly', 'not_at_all')),
  constraint session_feedback_text_len check (
    (what_helped is null or length(what_helped) <= 2000)
    and (what_was_missing is null or length(what_was_missing) <= 2000)
  )
);

create index if not exists session_feedback_buddy_idx on public.session_feedback (buddy_id, submitted_at desc);
create index if not exists session_feedback_intent_idx on public.session_feedback (session_intent) where session_intent is not null;

alter table public.session_feedback enable row level security;

-- ── D2. Only a session that actually happened can be rated ─────────────────
--
-- THE RULE THAT MATTERS: a mentor saying "completed" is not what makes a
-- session real, but a session that never reached `completed` cannot be rated
-- at all. Without this a student could be prompted to rate a cancelled or
-- merely scheduled call, and every quality average would include sessions that
-- never took place.
create or replace function public.session_feedback_only_completed()
returns trigger
language plpgsql
as $$
declare
  s public.video_sessions%rowtype;
begin
  select * into s from public.video_sessions where id = new.video_session_id;
  if not found then
    raise exception 'session_feedback: no such session' using errcode = 'check_violation';
  end if;
  if s.session_status <> 'completed' then
    raise exception 'session_feedback: session is % — only a completed session can be rated', s.session_status
      using errcode = 'check_violation',
            hint = 'Cancelled, expired, scheduled and in-progress sessions are not rateable.';
  end if;
  -- The feedback must belong to the people who were actually in the room.
  if new.student_id <> s.student_id or new.buddy_id <> s.buddy_id then
    raise exception 'session_feedback: student/buddy do not match the session'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;

drop trigger if exists session_feedback_only_completed_guard on public.session_feedback;
create trigger session_feedback_only_completed_guard
  before insert or update on public.session_feedback
  for each row execute function public.session_feedback_only_completed();

comment on table public.session_feedback is
  'The STUDENT rating the session. Distinct from buddy_feedback (mentor about student) and rating_prompts (App Store). One row per completed session; only completed sessions are rateable.';
