-- ── THE PHONE ANCHOR (Incident #62) ────────────────────────────────────────
--
-- One student is one account, and the thing that makes them one is a VERIFIED
-- phone number. Until now nothing in `profiles` recorded that fact, so every
-- consumer had to infer it from `profiles.phone` being non-null — and that
-- column is not evidence of anything:
--
--   * 54 production profiles have auth.users.phone set with phone_confirmed_at
--     NULL and last_sign_in_at NULL. They requested an OTP and never typed it
--     back. GoTrue creates the auth user at SEND time, not at verify time, so
--     an abandoned signup leaves a full-looking row behind.
--   * 92 profiles carry a bare 10-digit number written by the onboarding
--     "Mobile" field — a client-side form write, over the verified E.164 the
--     OTP route had put there. A number a student typed is not a number we
--     proved they hold.
--
-- So: a dedicated column that ONLY a completed OTP round-trip may stamp.

alter table public.profiles
  add column if not exists phone_verified_at timestamptz;

comment on column public.profiles.phone_verified_at is
  'When this account''s phone was proven by a completed OTP round-trip. The identity anchor: one student = one account = one verified phone. Written ONLY by /api/auth/verify-phone-otp and /api/auth/link-phone/verify. Never by a form.';

-- ── BACKFILL: exact, never inferred ─────────────────────────────────────────
--
-- auth.users.phone_confirmed_at is GoTrue's own record of a verified OTP. It is
-- the same fact this column names, so the backfill is a copy, not an estimate.
-- Rows without it stay NULL — which is the correct answer for the 54, and is
-- what makes "never verified" distinguishable from "verified, time unknown".
update public.profiles p
   set phone_verified_at = u.phone_confirmed_at
  from auth.users u
 where u.id = p.id
   and u.phone_confirmed_at is not null
   and p.phone_verified_at is null;

-- ── NORMALISE profiles.phone TO E.164 ───────────────────────────────────────
--
-- 92 rows hold 'XXXXXXXXXX' where the rest hold '+91XXXXXXXXXX'. Checked before
-- writing: across all 917 accounts carrying both a profile phone and an auth
-- phone, the last ten digits matched in 917 cases and differed in ZERO. So this
-- is a formatting repair, not an identity change.
--
-- The join to auth.users is the safety rail, not decoration: a row is rewritten
-- only when GoTrue independently holds the SAME ten digits. A profile phone
-- nobody can corroborate is left exactly as it is for manual review rather than
-- being reformatted into looking authoritative.
update public.profiles p
   set phone = '+91' || right(regexp_replace(p.phone, '\D', '', 'g'), 10)
  from auth.users u
 where u.id = p.id
   and p.phone is not null
   and p.phone !~ '^\+91[6-9][0-9]{9}$'
   and right(regexp_replace(p.phone, '\D', '', 'g'), 10) ~ '^[6-9][0-9]{9}$'
   and right(regexp_replace(u.phone, '\D', '', 'g'), 10)
     = right(regexp_replace(p.phone, '\D', '', 'g'), 10);

-- The gate reads this on every protected page load for an unanchored account.
-- Partial, because the anchored majority never needs to be scanned.
create index if not exists idx_profiles_unanchored
  on public.profiles (id)
  where phone_verified_at is null;

-- ── WHO OWNS A PHONE NUMBER: NOT A NEW FUNCTION ────────────────────────────
--
-- The link flow needs "is this number already someone's account?" before it
-- sends a code. `public.profile_id_for_verified_phone(text)` (migration
-- 20260819f) already answers exactly that, from auth.users, SECURITY DEFINER,
-- STABLE, and already revoked from anon/authenticated so the browser can never
-- use it to enumerate registered numbers.
--
-- A second function was drafted here and deleted rather than shipped: two
-- spellings of "who owns this phone" is precisely the duplicated-authority
-- failure this repo keeps paying for. The link routes call the existing one.
--
-- One property worth stating because the name oversells it: it does NOT
-- require phone_confirmed_at. For the assignment matcher that is immaterial,
-- and for the link flow it is the SAFER direction — a number held by one of the
-- 54 abandoned unconfirmed signups is still reported as taken, which is correct,
-- because GoTrue would refuse the attach anyway and the student's own OTP login
-- recovers that very account.
