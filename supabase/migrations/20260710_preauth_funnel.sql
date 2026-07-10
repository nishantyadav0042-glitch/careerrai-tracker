-- Pre-auth onboarding funnel: two small self-reported signals collected
-- before account creation, persisted once the account exists.
alter table profiles add column if not exists pain_points text[];
alter table profiles add column if not exists wants_mentor boolean;
