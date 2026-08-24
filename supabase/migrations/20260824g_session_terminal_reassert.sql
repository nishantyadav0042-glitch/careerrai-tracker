-- ── Re-asserting a terminal state is not a no-op, it is a false claim ───────
--
-- Found by the end-to-end probe of the mentor Start flow, 24 Aug. The
-- lifecycle trigger (20260824e) guards TRANSITIONS:
--
--     if new_s is distinct from old_s then ... check legality ...
--
-- so `completed -> completed` never reaches the check. Setting an already
-- completed session to 'completed' again succeeded silently.
--
-- No data was corrupted — ended_at is immutable, so the recorded facts held —
-- but the CALLER was told their write succeeded. A close-out submitted twice
-- looked exactly like a close-out submitted once, and "this session was
-- completed by this action" became unfalsifiable. That is precisely the
-- confusion the 16-sessions-0-completions episode was made of.
--
-- WHY A SECOND TRIGGER: a row-level BEFORE UPDATE trigger cannot tell "the
-- caller set session_status to the same value" from "the caller never
-- mentioned session_status" — NEW carries the old value either way. Postgres
-- answers this with UPDATE OF, which fires on the SET LIST rather than on the
-- values. The table already uses that form for set_video_session_span.
--
-- Unrelated updates to a finished session (notes, a calendar id, updated_at)
-- stay legal — only re-asserting its state does not.

create or replace function public.video_session_terminal_reassert()
returns trigger
language plpgsql
as $$
begin
  if old.session_status in ('completed', 'cancelled', 'expired') then
    raise exception 'video_sessions: this session is already % — its state cannot be set again', old.session_status
      using errcode = 'check_violation',
            hint = 'A finished session is history. Nothing further can be asserted about its state.';
  end if;
  return new;
end
$$;

drop trigger if exists video_session_terminal_reassert_guard on public.video_sessions;
create trigger video_session_terminal_reassert_guard
  before update of session_status on public.video_sessions
  for each row
  execute function public.video_session_terminal_reassert();

comment on function public.video_session_terminal_reassert() is
  'Rejects re-asserting session_status on an already-terminal session. UPDATE OF fires on the SET list, which is the only way to distinguish "set to the same value" from "not mentioned". Added 24 Aug 2026 after an end-to-end probe found duplicate completion succeeding silently.';
