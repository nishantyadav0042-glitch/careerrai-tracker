-- Manual-approval gate for automated Brain sends (founder, 24 Jul): "recommend
-- first, build a track record, automate later." Push/in_app decisions no
-- longer auto-fire — they queue as pending_approval with the exact copy that
-- WOULD be sent, and only actually send once a human approves. 'human' and
-- 'suppress' channel decisions never queued anything in the first place, so
-- they stay 'n_a'.
alter table public.decision_log add column if not exists send_status text not null default 'n_a';
  -- n_a | pending_approval | approved | sent | rejected
alter table public.decision_log add column if not exists pending_notification jsonb; -- {title, body, url} computed once at decision time
create index if not exists idx_decision_log_pending_approval on public.decision_log (created_at) where send_status = 'pending_approval';
