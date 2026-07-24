-- Closed-loop learning: link a Brain decision to the REAL notification it sent
-- (when the channel is push/in_app), so the lifecycle — recommended -> shown
-- (pushed_at) -> received (received_at) -> opened (clicked_at) -> outcome — is
-- read off real delivery data, not fabricated.
alter table public.decision_log add column if not exists notification_id uuid references public.notifications(id) on delete set null;
alter table public.decision_log add column if not exists business_impact text; -- positive | neutral | negative, filled by reconciliation
create index if not exists idx_decision_log_notification on public.decision_log (notification_id) where notification_id is not null;
