-- There is no such thing as a "beta account". (Founder, 10 Aug.)
--
-- CareerRai has exactly two kinds of student:
--   · PREMIUM — paid for the subscription, so they have a mentor.
--   · FREE    — using the app, has not subscribed.
--
-- The column has carried 'free_beta' since 20260613, from the days when the
-- product genuinely was a free beta with no paywall. It has not meant that for
-- a long time: the app is freemium now, and the value was quietly telling both
-- the founder and 258 students something untrue. lib/os/people-filter already
-- refused to render the word ("Honest labels — never 'Free beta'"); this
-- finishes the job at the source instead of translating a wrong value on the
-- way out.
--
-- Rename only. Nobody's access changes: is_premium is the gate and it is
-- untouched. 275 rows, every role, one value.

alter table public.profiles alter column subscription_status drop default;

alter table public.profiles drop constraint if exists profiles_subscription_status_check;

update public.profiles set subscription_status = 'free' where subscription_status = 'free_beta';

alter table public.profiles alter column subscription_status set default 'free';

alter table public.profiles
  add constraint profiles_subscription_status_check
  check (subscription_status in ('free', 'active', 'expired', 'paused', 'refund_requested'));
