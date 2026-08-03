-- A student's right to overrule the capacity engine.
--
-- The engine caps a daily plan at what the student has actually been
-- sustaining, so a plan is completable rather than aspirational. That is right
-- by default and wrong as an absolute: a student who studied 2h/day through
-- exam week, then clears their calendar, is told for the next fortnight that
-- they are a 2h person. The system's memory becomes a ceiling.
--
-- 'adaptive' (default) keeps today's behaviour: plan to what they sustain.
-- 'full'     ignores the behavioural cap and plans to what the pace requires,
--            which is what they told us they were committing to.
--
-- Deliberately NOT a boolean. "plan_sizing" names the decision being made, so a
-- third mode (a taper before the exam, say) is an added value rather than a
-- second flag that can contradict the first.
--
-- Reversible and safe to re-run. No backfill: every existing row takes the
-- default, which is exactly today's behaviour, so applying this changes nothing
-- until a student chooses otherwise.
--
-- ⚠️ MUST BE APPLIED BEFORE THE CODE THAT READS IT MERGES. routine-plan.ts
-- selects this column; if the column is absent that select fails and the daily
-- plan disappears. Apply, verify, then merge — never the other way round.

alter table public.profiles
  add column if not exists plan_sizing text not null default 'adaptive';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_plan_sizing_check'
  ) then
    alter table public.profiles
      add constraint profiles_plan_sizing_check
      check (plan_sizing in ('adaptive', 'full'));
  end if;
end
$$;

comment on column public.profiles.plan_sizing is
  'How the daily plan is sized. adaptive = capped at sustained behaviour (default); full = plan to the pace requirement, ignoring the behavioural cap. Set by the student from the Home pace card when their plan is capped.';
