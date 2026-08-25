-- ── THE SESSION-CREDIT LIFECYCLE PROBE SUITE ────────────────────────────────
--
-- Run this against careerrai-test (NEVER production — it deletes fixtures).
-- It raises an exception if a single probe misbehaves, so it cannot pass by
-- being ignored.
--
-- WHY THIS FILE EXISTS. Phase 2B's enforcement lives entirely in the database:
-- one trigger function, two check constraints, one enum, one foreign key.
-- A vitest guard that greps the source for those words would prove nothing —
-- it would pass against a database that had none of them, which is exactly the
-- failure mode this repo has already paid for four times (a guard matching a
-- comment; a guard satisfied by a bare function call). The only honest test of
-- a database constraint is to attack the database.
--
-- HOW A PROBE WORKS. __probe() runs the statement inside a subtransaction and
-- then deliberately raises, so the effect is rolled back whether the statement
-- succeeded or failed. Probes therefore do not contaminate each other and can
-- run in any order.
--
-- EXPECTED: probes 1,2,3,4,15,19,26,29 are ACCEPTED (legal shapes — a suite
-- where everything is refused proves only that the table is unusable).
-- Everything else is REFUSED.
--
-- NON-VACUITY, which is not automated here because it requires DDL: disable
-- session_credit_coherent_guard and probes 16,17,18,20,25,27,30 all become
-- ACCEPTED; drop session_credits_ownership_paired and 21,22,23,28 become
-- ACCEPTED; set the FK back to ON DELETE SET NULL and, with the guard also
-- disabled, deleting a linked session is ACCEPTED and orphans the credit.
-- Recorded 26 Aug 2026. Re-prove it if you change any of the three.

begin;

create or replace function public.__probe(stmt text) returns text
language plpgsql as $f$
begin
  begin
    execute stmt;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if sqlerrm = 'PROBE_ACCEPTED' then return 'ACCEPTED'; end if;
    return 'REFUSED: ' || sqlerrm;
  end;
end $f$;

-- ── fixtures ────────────────────────────────────────────────────────────────
-- Two students, two mentors, one payment, three sessions, one credit. The
-- "mentors" are ordinary profiles: session_credits.buddy_id references
-- profiles(id) with no role predicate, and pretending otherwise here would
-- test a constraint the database does not have.

delete from public.session_credits;
delete from public.video_sessions;
delete from public.student_payments;
delete from public.profiles where id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');

insert into public.profiles (id, full_name, role) values
 ('11111111-1111-4111-8111-111111111111','Probe Student','student'),
 ('22222222-2222-4222-8222-222222222222','Probe Mentor','buddy'),
 ('33333333-3333-4333-8333-333333333333','Other Student','student'),
 ('44444444-4444-4444-8444-444444444444','Other Mentor','buddy');

insert into public.student_payments (id, student_id, amount, plan, status) values
 ('55555555-5555-4555-8555-555555555555','11111111-1111-4111-8111-111111111111',29900,'session','paid');

insert into public.video_sessions (id, student_id, buddy_id, session_status) values
 ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','scheduled'),
 ('77777777-7777-4777-8777-777777777777','33333333-3333-4333-8333-333333333333','22222222-2222-4222-8222-222222222222','scheduled'),
 ('99999999-9999-4999-8999-999999999999','11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','scheduled');

insert into public.session_credits (id, student_id, payment_id, status) values
 ('88888888-8888-4888-8888-888888888888','11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','paid');

-- ── the probes ──────────────────────────────────────────────────────────────

create temporary table probe_result as
with p(n, family, label, stmt) as (values
 -- PRE-2B INVARIANTS. These 14 all held before Phase 2B and must still hold:
 -- a migration that hardens a table by weakening it elsewhere is a regression
 -- wearing a feature's clothes.
 (1,'baseline','a fresh paid credit, no mentor, no session',
  $$insert into session_credits (student_id,status) values ('33333333-3333-4333-8333-333333333333','paid')$$),
 (2,'baseline','a paid credit MAY carry a mentor (pre-assignment is legal)',
  $$update session_credits set buddy_id='22222222-2222-4222-8222-222222222222' where id='88888888-8888-4888-8888-888888888888'$$),
 (3,'baseline','assigned WITH a mentor',
  $$update session_credits set status='assigned', buddy_id='22222222-2222-4222-8222-222222222222' where id='88888888-8888-4888-8888-888888888888'$$),
 (4,'baseline','a second credit for the same student on a different payment',
  $$insert into session_credits (student_id,status) values ('11111111-1111-4111-8111-111111111111','paid')$$),
 (5,'guard-1','assigned with NO mentor',
  $$update session_credits set status='assigned' where id='88888888-8888-4888-8888-888888888888'$$),
 (6,'guard-2','scheduled with NO session',
  $$update session_credits set status='scheduled', buddy_id='22222222-2222-4222-8222-222222222222' where id='88888888-8888-4888-8888-888888888888'$$),
 (7,'guard-3','a session belonging to ANOTHER student',
  $$update session_credits set status='scheduled', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='77777777-7777-4777-8777-777777777777' where id='88888888-8888-4888-8888-888888888888'$$),
 (8,'guard-3','a session held by a DIFFERENT mentor',
  $$update session_credits set status='scheduled', buddy_id='44444444-4444-4444-8444-444444444444', video_session_id='66666666-6666-4666-8666-666666666666' where id='88888888-8888-4888-8888-888888888888'$$),
 (9,'guard-4','complete the credit while the session is only scheduled',
  $$update session_credits set status='completed', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='66666666-6666-4666-8666-666666666666' where id='88888888-8888-4888-8888-888888888888'$$),
 (10,'unique','mint a SECOND credit from the same payment',
  $$insert into session_credits (student_id,payment_id,status) values ('11111111-1111-4111-8111-111111111111','55555555-5555-4555-8555-555555555555','paid')$$),
 (11,'unique','two credits pointing at ONE session',
  $$update session_credits set status='scheduled', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='66666666-6666-4666-8666-666666666666' where id='88888888-8888-4888-8888-888888888888';
    insert into session_credits (student_id,buddy_id,video_session_id,status) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','66666666-6666-4666-8666-666666666666','scheduled')$$),
 (12,'status','an invented status',
  $$update session_credits set status='delivered' where id='88888888-8888-4888-8888-888888888888'$$),
 (13,'fk','delete the session out from under a linked credit',
  $$update session_credits set status='scheduled', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='66666666-6666-4666-8666-666666666666' where id='88888888-8888-4888-8888-888888888888';
    delete from video_sessions where id='66666666-6666-4666-8666-666666666666'$$),
 (14,'guard-5','relink a credit to a different session',
  $$update session_credits set status='scheduled', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='66666666-6666-4666-8666-666666666666' where id='88888888-8888-4888-8888-888888888888';
    update session_credits set video_session_id='99999999-9999-4999-8999-999999999999' where id='88888888-8888-4888-8888-888888888888'$$),

 -- PHASE 2B. Everything below is new. Probe 22 is the Dhruv shape exactly:
 -- work that was visible and unowned.
 (15,'baseline','assignment_failed, fully described',
  $$update session_credits set status='assignment_failed', owner='ops', next_action='find any available mentor and assign manually', failure_reason='no mentor with capacity', failure_at=now() where id='88888888-8888-4888-8888-888888888888'$$),
 (16,'guard-6','assignment_failed with NO owner and no next_action',
  $$update session_credits set status='assignment_failed', failure_reason='x', failure_at=now() where id='88888888-8888-4888-8888-888888888888'$$),
 (17,'guard-6','assignment_failed with an owner but NO failure trail',
  $$update session_credits set status='assignment_failed', owner='ops', next_action='assign' where id='88888888-8888-4888-8888-888888888888'$$),
 (18,'guard-7','assignment_failed while HOLDING a mentor',
  $$update session_credits set status='assignment_failed', buddy_id='22222222-2222-4222-8222-222222222222', owner='ops', next_action='assign', failure_reason='x', failure_at=now() where id='88888888-8888-4888-8888-888888888888'$$),
 (19,'baseline','booking_blocked with a mentor, fully described',
  $$update session_credits set status='booking_blocked', buddy_id='22222222-2222-4222-8222-222222222222', owner='mentor', next_action='mentor must connect Google Calendar', failure_reason='mentor has no OAuth', failure_at=now() where id='88888888-8888-4888-8888-888888888888'$$),
 (20,'guard-8','booking_blocked with NO mentor',
  $$update session_credits set status='booking_blocked', owner='ops', next_action='book', failure_reason='x', failure_at=now() where id='88888888-8888-4888-8888-888888888888'$$),
 (21,'check','an owner with no next_action',
  $$update session_credits set owner='ops' where id='88888888-8888-4888-8888-888888888888'$$),
 (22,'check','a next_action with no owner — THE DHRUV SHAPE',
  $$update session_credits set next_action='schedule' where id='88888888-8888-4888-8888-888888888888'$$),
 (23,'check','whitespace-only next_action',
  $$update session_credits set owner='ops', next_action='   ' where id='88888888-8888-4888-8888-888888888888'$$),
 (24,'enum','an owner outside the enum',
  $$update session_credits set owner='intern', next_action='schedule' where id='88888888-8888-4888-8888-888888888888'$$),
 (25,'guard-9','a refunded credit still owing work',
  $$update session_credits set status='refunded', owner='ops', next_action='refund again?' where id='88888888-8888-4888-8888-888888888888'$$),
 (26,'baseline','recovery — assignment_failed back to assigned clears the debt',
  $$update session_credits set status='assignment_failed', owner='ops', next_action='assign', failure_reason='no capacity', failure_at=now() where id='88888888-8888-4888-8888-888888888888';
    update session_credits set status='assigned', buddy_id='22222222-2222-4222-8222-222222222222', owner=null, next_action=null where id='88888888-8888-4888-8888-888888888888'$$),
 (27,'guard-8','booking_blocked while HOLDING a linked session',
  $$update session_credits set status='booking_blocked', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='66666666-6666-4666-8666-666666666666', owner='ops', next_action='book', failure_reason='x', failure_at=now() where id='88888888-8888-4888-8888-888888888888'$$),
 (28,'check','whitespace-only failure_reason',
  $$update session_credits set status='assignment_failed', owner='ops', next_action='assign', failure_reason='  ', failure_at=now() where id='88888888-8888-4888-8888-888888888888'$$),
 (29,'baseline','a completed credit with no debt',
  $$update video_sessions set session_status='completed' where id='66666666-6666-4666-8666-666666666666';
    update session_credits set status='completed', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='66666666-6666-4666-8666-666666666666' where id='88888888-8888-4888-8888-888888888888'$$),
 (30,'guard-9','a COMPLETED credit still owing work',
  $$update video_sessions set session_status='completed' where id='66666666-6666-4666-8666-666666666666';
    update session_credits set status='completed', buddy_id='22222222-2222-4222-8222-222222222222', video_session_id='66666666-6666-4666-8666-666666666666', owner='ops', next_action='chase feedback' where id='88888888-8888-4888-8888-888888888888'$$)
)
select n, family, label,
       public.__probe(stmt) as outcome,
       (n in (1,2,3,4,15,19,26,29)) as should_be_accepted
from p;

-- ── the verdict ─────────────────────────────────────────────────────────────

do $$
declare
  bad int;
  detail text;
begin
  select count(*), string_agg(format('  #%s %s — expected %s, got %s',
           n, label, case when should_be_accepted then 'ACCEPTED' else 'REFUSED' end, outcome), E'\n' order by n)
    into bad, detail
    from probe_result
   where should_be_accepted <> (outcome = 'ACCEPTED');

  if bad > 0 then
    raise exception E'SESSION-CREDIT LIFECYCLE: % probe(s) misbehaved\n%', bad, detail;
  end if;
  raise notice 'session-credit lifecycle: all 30 probes behaved as specified';
end $$;

drop function public.__probe(text);
delete from public.session_credits;
delete from public.video_sessions;
delete from public.student_payments;
delete from public.profiles where id in (
  '11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444');

commit;
