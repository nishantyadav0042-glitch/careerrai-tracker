-- ── DO THE RESTORED CONSTRAINTS ACTUALLY BITE? (Phase parity-3) ─────────────
--
-- Run against careerrai-test ONLY. Every probe rolls back; nothing persists.
--
-- WHY THIS EXISTS. `20260826e` restored 37 objects across six tables so the
-- adversarial round could be honest. Matching production's md5 proves the
-- objects are THERE. It does not prove they REFUSE anything — a constraint can
-- be present and still never fire if the probe is aimed wrong. So each rule is
-- attacked, and then removed and attacked again.
--
-- The founder's standard, applied literally: every green result must answer
-- "what exactly prevented the bad state?" — not "the statement errored".
-- Probe 4 is in here as the cautionary example. Its first version used the
-- ghost id for BOTH student_id and sender_id, so it was refused by the SENDER
-- foreign key while claiming to test the STUDENT one. It passed, and it was
-- testing the wrong thing. Only the non-vacuity pass exposed that: with the
-- student FK dropped it stayed refused. It is now written with a real sender.
--
-- RESULT, 26 Aug 2026: 15/15 behaved as specified. Then all ten protections
-- were dropped at once and 12/12 attacks became ACCEPTED; restored, and the
-- six tables were still byte-identical to production.

create or replace function public.__probe(stmt text) returns text
language plpgsql as $f$
begin
  begin
    execute stmt;
    raise exception 'PROBE_ACCEPTED';
  exception when others then
    if sqlerrm = 'PROBE_ACCEPTED' then return 'ACCEPTED'; end if;
    return 'REFUSED: ' || left(sqlerrm, 70);
  end;
end $f$;

-- Fixtures. NOTE: '1111…1111' must also exist in auth.users, because
-- refund_requests.student_id references auth.users(id) and NOT profiles(id) —
-- the only table in this set that reaches outside the public schema. A profile
-- row alone is not enough, and probe 14 is what proves it.
insert into public.profiles (id, full_name, role) values
 ('11111111-1111-4111-8111-111111111111','Probe Student','student'),
 ('22222222-2222-4222-8222-222222222222','Probe Mentor','buddy')
on conflict (id) do nothing;

create temporary table probe_result as
with p(n, target, label, stmt, expect) as (values
 (1,'idempotency_keys','PK: the SAME payment key twice — the duplicate-callback guard',
  $$insert into idempotency_keys (key,user_id,endpoint,status,response) values ('k1','11111111-1111-4111-8111-111111111111','/api/payments/webhook',200,'{}');
    insert into idempotency_keys (key,user_id,endpoint,status,response) values ('k1','11111111-1111-4111-8111-111111111111','/api/payments/webhook',200,'{}')$$,'REFUSED'),
 (2,'idempotency_keys','FK: a key for a user who does not exist',
  $$insert into idempotency_keys (key,user_id,endpoint,status,response) values ('k2','99999999-9999-4999-8999-999999999999','/x',200,'{}')$$,'REFUSED'),
 (3,'chat_messages','baseline: a valid message',
  $$insert into chat_messages (student_id,buddy_id,sender_id,body) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','hello')$$,'ACCEPTED'),
 (4,'chat_messages','FK: ghost STUDENT with a REAL sender — isolates the student key',
  $$insert into chat_messages (student_id,buddy_id,sender_id,body) values ('99999999-9999-4999-8999-999999999999','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','hi')$$,'REFUSED'),
 (5,'chat_messages','body over 2000 characters',
  $$insert into chat_messages (student_id,buddy_id,sender_id,body) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111', repeat('x',2001))$$,'REFUSED'),
 (6,'chat_messages','empty body with no attachment',
  $$insert into chat_messages (student_id,buddy_id,sender_id,body) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','')$$,'REFUSED'),
 (7,'chat_messages','half an attachment — path but no name/mime/size/kind',
  $$insert into chat_messages (student_id,buddy_id,sender_id,body,attachment_path) values ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','11111111-1111-4111-8111-111111111111','see this','a/b.png')$$,'REFUSED'),
 -- 8-11 are the ONCE-PER-DAY mechanism. This is the pattern the buddy-promotion
 -- cap should reuse: a UNIQUE INDEX on (user, type, IST date), which fails
 -- CLOSED in the database and cannot be defeated by a second device.
 (8,'notifications','ONCE PER DAY: same user + capped type + same IST day',
  $$insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','daily_heartbeat','a','b','2026-08-27 12:00:00+00');
    insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','daily_heartbeat','a','b','2026-08-27 13:00:00+00')$$,'REFUSED'),
 (9,'notifications','the cap is SELECTIVE: an uncapped type may repeat',
  $$insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','membership','a','b','2026-08-27 12:00:00+00');
    insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','membership','a','b','2026-08-27 13:00:00+00')$$,'ACCEPTED'),
 (10,'notifications','IST BOUNDARY: 23:50 and 00:10 IST are DIFFERENT days',
  $$insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','daily_heartbeat','a','b','2026-08-27 18:20:00+00');
    insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','daily_heartbeat','a','b','2026-08-27 18:40:00+00')$$,'ACCEPTED'),
 (11,'notifications','IST BOUNDARY: 23:30 and 23:50 IST are the SAME day',
  $$insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','daily_heartbeat','a','b','2026-08-27 18:00:00+00');
    insert into notifications (user_id,type,title,body,created_at) values ('11111111-1111-4111-8111-111111111111','daily_heartbeat','a','b','2026-08-27 18:20:00+00')$$,'REFUSED'),
 (12,'refund_requests','UNIQUE: a second refund request from one student',
  $$insert into refund_requests (student_id,days_logged) values ('11111111-1111-4111-8111-111111111111',10);
    insert into refund_requests (student_id,days_logged) values ('11111111-1111-4111-8111-111111111111',10)$$,'REFUSED'),
 (13,'refund_requests','an invented status',
  $$insert into refund_requests (student_id,days_logged,status) values ('11111111-1111-4111-8111-111111111111',10,'processing')$$,'REFUSED'),
 (14,'refund_requests','FK targets auth.users: a profile-only id is refused',
  $$insert into refund_requests (student_id,days_logged) values ('22222222-2222-4222-8222-222222222222',10)$$,'REFUSED'),
 (15,'google_oauth_tokens','PK: two tokens for one mentor',
  $$insert into google_oauth_tokens (user_id,refresh_token) values ('22222222-2222-4222-8222-222222222222','t1');
    insert into google_oauth_tokens (user_id,refresh_token) values ('22222222-2222-4222-8222-222222222222','t2')$$,'REFUSED')
)
select n, target, label,
       case when public.__probe(stmt) like 'REFUSED%' then 'REFUSED' else 'ACCEPTED' end as got,
       expect
from p;

do $$
declare bad int; detail text;
begin
  select count(*), string_agg(format('  #%s %s — expected %s, got %s', n, label, expect, got), E'\n' order by n)
    into bad, detail from probe_result where got <> expect;
  if bad > 0 then raise exception E'AUDIT-GATE CONSTRAINTS: % probe(s) misbehaved\n%', bad, detail; end if;
  raise notice 'audit-gate constraints: all 15 probes behaved as specified';
end $$;

drop function public.__probe(text);
delete from public.chat_messages;
delete from public.notifications;
delete from public.idempotency_keys;
delete from public.refund_requests;
delete from public.google_oauth_tokens;
delete from public.profiles where full_name in ('Probe Student','Probe Mentor');
