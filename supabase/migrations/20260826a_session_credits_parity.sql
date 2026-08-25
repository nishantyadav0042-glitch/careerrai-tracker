-- ── PHASE 2A: restore careerrai-test to production parity ───────────────────
--
-- DECLARED, not applied by hand. The founder's standing rule after five
-- earlier divergences: never "fix" the test DB manually — write the migration.
--
-- Applied to careerrai-test (endycmkdphymmhzniaih) on 26 Aug 2026.
-- NOT applied to production: production already has every object below. This
-- file exists so the two schemas can be rebuilt to the same shape from source.
--
-- WHY THIS IS PHASE 2's STEP ZERO. Phase 2's entire job is constraint
-- enforcement. The test database was missing FIVE of nine session_credits
-- constraints and THREE indexes — including status_check, the video_session
-- foreign key, and the payment uniqueness that stops one payment minting two
-- credits. Every adversarial probe written before this would have "passed" on
-- a schema physically incapable of refusing. That is worse than no test: it is
-- a test that certifies a hole.
--
-- AND A DEEPER ONE, found only because the first attempt errored:
--   student_payments on test had NO PRIMARY KEY AT ALL.
-- The money table. That is why the foreign keys below could not be created.
-- Seventh prod/test divergence logged in this repo. Verified safe before
-- adding: 0 rows, 0 null ids, 0 duplicate ids on test.
--
-- Every definition below was replayed VERBATIM from production
-- pg_get_constraintdef()/indexdef output, never retyped from memory, and the
-- result verified by md5-comparing all 9 constraints, 7 indexes and 2 triggers
-- against production. All 18 signatures match.

alter table public.student_payments
  add constraint student_payments_pkey primary key (id);

alter table public.session_credits
  add constraint session_credits_status_check
  check (status = any (array['paid'::text,'assigned'::text,'scheduled'::text,'completed'::text,'refunded'::text]));

alter table public.session_credits
  add constraint session_credits_student_id_fkey
  foreign key (student_id) references public.profiles(id) on delete cascade;

alter table public.session_credits
  add constraint session_credits_buddy_id_fkey
  foreign key (buddy_id) references public.profiles(id) on delete set null;

alter table public.session_credits
  add constraint session_credits_video_session_id_fkey
  foreign key (video_session_id) references public.video_sessions(id) on delete set null;

alter table public.session_credits
  add constraint session_credits_payment_id_fkey
  foreign key (payment_id) references public.student_payments(id) on delete set null;

alter table public.session_credits
  add constraint session_credits_credited_to_payment_id_fkey
  foreign key (credited_to_payment_id) references public.student_payments(id) on delete set null;

create unique index session_credits_payment_id_uniq
  on public.session_credits using btree (payment_id) where (payment_id is not null);

create index session_credits_buddy_idx
  on public.session_credits using btree (buddy_id, status);

create index session_credits_unassigned_idx
  on public.session_credits using btree (created_at) where (status = 'paid'::text);
