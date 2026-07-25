-- ── exam_ready requires evidence — enforced where no writer can forget ──────
--
-- The app-level rule "exam_ready cannot be self-declared" has existed since
-- the coverage API shipped, and it failed anyway: topic_coverage.status has
-- ten write paths, and the tenth (the mandatory weekly review) skipped the
-- validator — ten topics reached exam_ready in eight days through that one
-- door. An invariant that N writers must each remember is an invariant that
-- fails at writer N+1. This trigger is the layer every writer passes through
-- whether it remembers to or not.
--
-- Deliberately a NECESSARY condition, not the full six-check evidence rule:
-- duplicating deriveStatus() in SQL would create exactly the second
-- implementation this whole effort exists to kill. The full rule lives in
-- src/lib/evidence.ts; the trigger only guarantees its cheapest consequence —
-- no topic is exam_ready with zero logged evidence — which is the invariant
-- every leak so far has violated.

create or replace function public.guard_exam_ready()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'exam_ready'
     and (tg_op = 'INSERT' or old.status is distinct from 'exam_ready') then
    if not exists (
      select 1 from public.topic_evidence te
      where te.student_id = new.student_id and te.topic = new.topic
    ) then
      raise exception 'exam_ready requires logged evidence for topic "%"', new.topic
        using errcode = 'check_violation',
              hint = 'Status is earned through /api/evidence, never declared.';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists topic_coverage_exam_ready_guard on public.topic_coverage;
create trigger topic_coverage_exam_ready_guard
  before insert or update of status on public.topic_coverage
  for each row execute function public.guard_exam_ready();
