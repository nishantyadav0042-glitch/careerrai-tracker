-- Remove the read-only demo system entirely.
--
-- The demo student/buddy seed accounts and their whole sales-demo apparatus are
-- gone: a real student (is_demo=false) was landing on the "Demo — view only"
-- banner because the demo seed shared a look-alike phone/name, and the founder
-- asked for the demo profile and every demo button removed app-wide.
--
-- App code no longer references is_demo, cr_demo, /demo, demo-login, or the
-- refresh cron. This migration drops the one remaining schema object — the
-- daily date-reanchoring function the refresh-demo cron used to call.
--
-- The demo seed accounts themselves are live data, deleted directly (profiles +
-- auth.users cascade); the is_demo boolean column is left in place as a
-- harmless, now-unused flag so this migration stays non-destructive to schema.

drop function if exists public.refresh_demo_dates();
