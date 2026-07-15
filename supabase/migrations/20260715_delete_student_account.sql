-- Account deletion (Google Play + Apple App Store requirement).
--
-- profiles.id has NO foreign key to auth.users, and nothing cascades from the
-- auth row — so deleting the auth user alone would ORPHAN every row of personal
-- data. Deletion must wipe the public-schema data itself. Most child tables
-- CASCADE from profiles.id, so a single `delete from profiles` clears them; the
-- handful of NO ACTION / non-FK references are cleared first so the delete
-- doesn't get blocked.
--
-- Runs as SECURITY DEFINER so the service-role route can wipe across tables in
-- one transaction (atomic — either all personal data goes, or none does).
create or replace function public.delete_student_account(p_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Guard: this route only deletes STUDENT accounts. Never let it be used to
  -- nuke a buddy or admin (which would orphan the students they serve).
  if not exists (select 1 from profiles where id = p_id and role = 'student') then
    raise exception 'delete_student_account: % is not a student account', p_id;
  end if;

  -- Clear the NO ACTION references that would otherwise block the delete:
  --   profiles.buddy_id / shadow_rival_id — another profile pointing AT this id
  --   feedback.student_id / buddy_id       — NO ACTION on both sides
  update profiles set buddy_id = null where buddy_id = p_id;
  update profiles set shadow_rival_id = null where shadow_rival_id = p_id;
  delete from feedback where student_id = p_id or buddy_id = p_id;

  -- Journey tracking keys off the auth user id with no FK cascade — remove it.
  delete from student_events where user_id = p_id;

  -- The profile delete cascades everything else: daily_reports, streak_data,
  -- daily_routines, routine_task_completions, topic_coverage, chat_messages,
  -- notifications, student_payments, test_results, mock_debriefs,
  -- session_requests, video_sessions, scholarships, coupon_redemptions, etc.
  delete from profiles where id = p_id;
end;
$$;

-- Only the service-role backend (the /api/account/delete route) may invoke it.
revoke all on function public.delete_student_account(uuid) from public, anon, authenticated;
grant execute on function public.delete_student_account(uuid) to service_role;
