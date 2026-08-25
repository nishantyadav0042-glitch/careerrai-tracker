-- ── PARITY, PART 2: video_sessions and student_payments ─────────────────────
--
-- HOW THIS WAS FOUND, and why it matters more than the migration itself.
--
-- Phase 2C probe #8 asked: a student already has a live session with this
-- mentor — can they book a second one? Production says no; `one_live_session_
-- per_pair` is a unique index and Incident #21 is the reason it exists. The
-- probe came back **`booked`, sessions=2**.
--
-- The RPC was fine. The TEST DATABASE was missing the index.
--
-- That is the *eighth* prod/test divergence this repo has logged, and it is
-- the same lesson as Phase 2A, one table over: a probe against a schema that
-- cannot refuse does not prove the code refuses. It certifies a hole. Phase 2A
-- swept session_credits and student_payments' primary key and stopped there.
-- It should have swept the whole booking chain.
--
-- SO A COUNT WAS RUN ACROSS BOTH DATABASES rather than another table-by-table
-- guess. Constraints + indexes + triggers, per table:
--
--     video_sessions      prod 25   test 11    <- fixed here
--     student_payments    prod 11   test  5    <- fixed here
--     profiles            prod 36   test  2    <- NOT fixed; see below
--     session_credits     prod 19   test 20    <- test is ahead by 2B's index
--
-- and 76 of production's 91 tables have no constraints on test at all, because
-- careerrai-test was stood up on 22 Aug to reproduce one React error and was
-- never a replica. **It is a scaffold, not a copy.** Anything proved on it is
-- proved only for the objects that have been explicitly restored.
--
-- WHY profiles IS LEFT ALONE. 34 missing objects, none of them load-bearing
-- for booking atomicity, and it carries role/premium/allowlist rules whose
-- restoration deserves its own pass rather than a footnote in a booking
-- migration. It is logged, not silently skipped.
--
-- Applied to careerrai-test (endycmkdphymmhzniaih) on 26 Aug 2026.
-- NOT applied to production: every object below already exists there. Each was
-- replayed verbatim from production's pg_get_constraintdef()/indexdef output.

-- ── video_sessions ──────────────────────────────────────────────────────────

-- NOTE ON SYNTAX. The cast is written as `array[...]::character varying[]` and
-- only THEN to text[], because that is the form Postgres re-renders identically
-- to production's. Writing the per-element cast instead produces a
-- semantically identical constraint whose pg_get_constraintdef() text differs —
-- which would leave the two schemas looking divergent to every future
-- fingerprint comparison, for no reason. All three definitions below were
-- md5-verified against production after being applied.
alter table public.video_sessions
  add constraint valid_status
  check ((session_status)::text = any ((array['scheduled','active','completed','cancelled','expired']::character varying[])::text[]));

alter table public.video_sessions
  add constraint video_sessions_session_type_check
  check ((session_type)::text = any ((array['session','review','doubt_solving','mock_review','onboarding','guidance']::character varying[])::text[]));

alter table public.video_sessions
  add constraint video_sessions_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

alter table public.video_sessions
  add constraint video_sessions_buddy_id_fkey
  foreign key (buddy_id) references public.profiles(id) on delete cascade;

-- THE ONE THAT PROBE #8 WAS ACTUALLY TESTING. One live session per (mentor,
-- student) pair. Incident #21 — a pair sent to two different video rooms.
create unique index one_live_session_per_pair
  on public.video_sessions using btree (buddy_id, student_id)
  where ((session_status)::text = any ((array['scheduled','active']::character varying[])::text[]));

create index idx_video_sessions_buddy on public.video_sessions using btree (buddy_id);
create index idx_video_sessions_buddy_status_time on public.video_sessions using btree (buddy_id, session_status, scheduled_at desc);
create index idx_video_sessions_days_since on public.video_sessions using btree (student_id, last_session_date);
create index idx_video_sessions_google_event_id on public.video_sessions using btree (google_event_id);
create index idx_video_sessions_scheduled on public.video_sessions using btree (scheduled_at) where ((session_status)::text = 'scheduled'::text);
create index idx_video_sessions_status_time on public.video_sessions using btree (student_id, session_status, scheduled_at desc);
create index idx_video_sessions_student on public.video_sessions using btree (student_id);
create index idx_video_sessions_student_upcoming on public.video_sessions using btree (student_id, session_status, scheduled_at);
create index idx_video_sessions_upcoming on public.video_sessions using btree (buddy_id, session_status, scheduled_at);

-- ── student_payments ────────────────────────────────────────────────────────

alter table public.student_payments
  add constraint student_payments_status_check
  check (status = any (array['created'::text,'paid'::text,'failed'::text,'refunded'::text]));

alter table public.student_payments
  add constraint student_payments_tax_mode_check
  check (tax_mode = any (array['inclusive'::text,'exclusive'::text]));

alter table public.student_payments
  add constraint student_payments_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

-- The second pointer between a payment and a credit. It is reproduced because
-- production has it, not because it is a good idea: session_credits.payment_id
-- already points the other way, and two pointers can disagree. Noted for the
-- cardinality review, not changed here — parity migrations copy, they do not
-- improve.
alter table public.student_payments
  add constraint student_payments_session_credit_id_fkey
  foreign key (session_credit_id) references public.session_credits(id);

create index idx_student_payments_order on public.student_payments using btree (razorpay_order_id);
create index idx_student_payments_student on public.student_payments using btree (student_id);
