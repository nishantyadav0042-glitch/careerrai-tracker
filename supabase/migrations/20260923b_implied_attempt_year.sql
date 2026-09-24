-- ── THE EXAM YEAR A STUDENT'S OWN FINISH DATE ALREADY STATES ────────────────
--
-- Bug-fix sprint, 23 Sep 2026 (issue #3, "plan shows the wrong exam year").
--
-- 299 student profiles have attempt_year NULL — almost all from the July
-- onboarding, which never asked. Every reader falls back to the current
-- calendar year for them. For 13, that contradicts their own saved answer:
-- their syllabus finish date is AFTER CAT 2026's exam day (29 Nov 2026), so
-- the app counted down to an exam they are not sitting (reported by a
-- counsellor for a student with a 31 Dec 2026 finish date).
--
-- The rule is lib/cat-cycle.ts impliedAttemptYear(): a syllabus finishing
-- after year Y's exam day is for CAT Y + 1; on or before exam day, CAT Y.
-- CAT is the last Sunday of November (lib/exam-calendar.ts catExamDate).
--
-- Scope, deliberately narrow:
--   · ONLY rows where attempt_year IS NULL. An exam year a student chose is
--     never overwritten, even where it disagrees with their date (6 such
--     students keep 2026 with a 2027 date; they can change it themselves).
--   · ONLY rows whose implied year is later than the current calendar year,
--     i.e. differs from what every reader already falls back to. Every other
--     NULL row keeps behaving exactly as it did; nothing is written to it.
--     Dry-run on 23 Sep: exactly 13 rows, all 2026 → 2027.
--
-- Reversible: the ids changed are listed in the admin audit log row this
-- writes, and the DOWN below restores NULL for exactly those ids.

with implied as (
  select p.id,
         -- impliedAttemptYear(): the date's own year, or the next one when the
         -- date falls after that year's exam day (the last Sunday of November).
         extract(year from p.syllabus_target_date)::int
           + case when p.syllabus_target_date >
               (make_date(extract(year from p.syllabus_target_date)::int, 11, 30)
                 - extract(dow from make_date(extract(year from p.syllabus_target_date)::int, 11, 30))::int)
             then 1 else 0 end as year
  from profiles p
  where p.role = 'student'
    and p.attempt_year is null
    and p.syllabus_target_date is not null
),
changed as (
  update profiles p
     set attempt_year = i.year
    from implied i
   where p.id = i.id
     and p.attempt_year is null
     -- Only where it differs from what readers already fall back to (the
     -- current calendar year); every other NULL row is left untouched.
     and i.year > extract(year from current_date)::int
  returning p.id, p.attempt_year
)
insert into admin_audit_log (admin_id, action, target_type, target_id, metadata)
select null, 'attempt_year_backfilled_from_finish_date', 'system', null,
       jsonb_build_object('ids', coalesce(jsonb_agg(id), '[]'::jsonb), 'count', count(*),
                          'rule', 'finish date after that year''s exam day implies the next CAT',
                          'migration', '20260923b_implied_attempt_year')
from changed;

-- DOWN (restores NULL for exactly the rows this changed):
-- update profiles set attempt_year = null
--  where id in (select jsonb_array_elements_text(metadata->'ids')::uuid from admin_audit_log
--               where action = 'attempt_year_backfilled_from_finish_date'
--               order by created_at desc limit 1);
