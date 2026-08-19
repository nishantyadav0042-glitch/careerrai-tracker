-- Mentor assignment matches the VERIFIED phone, not the editable copy
--
-- THE WEAKNESS. admin/allowlist assigns a mentor with
--
--     .from('profiles').update({ buddy_id }).eq('phone', phone)
--
-- and profiles.phone is a column students can edit in onboarding. So the
-- assignment read a value the student controls, rather than the number they
-- proved they own by passing an OTP. A student who set their phone to match a
-- pending allowlist entry would be assigned that entry's mentor -- and
-- resolvePair() then grants chat access on buddy_id alone.
--
-- IT IS NOT THEORETICAL THAT THE TWO DIVERGE. 36 students already have a
-- profiles.phone that does not match their auth.users.phone, 32 of them after
-- completing onboarding. The editable field is used.
--
-- WHY MATCH INSTEAD OF LOCK. Locking the field was the first instinct and it
-- breaks something real: 4 students signed up without a verified phone (email
-- / Google) and 2 of them supplied their number through exactly that
-- onboarding field. For them it is the only way to give us a phone at all.
-- Matching on the verified number closes the hole at its root and leaves
-- onboarding untouched: a student may edit profiles.phone freely and it can
-- never win them a mentor.
--
-- FORMATS DIFFER, so normalisation is not optional: auth.users.phone is
-- '917389513308' and profiles.phone is '+917440964764'. Both sides are
-- stripped to digits. auth.users.phone carries no duplicates (verified: 0
-- across 531 rows), so the resolution is unambiguous.
--
-- SECURITY DEFINER because auth.users is not reachable from PostgREST, and
-- EXECUTE is granted to service_role only -- this is an admin-flow helper, not
-- something a client may call to enumerate accounts by phone number.

CREATE OR REPLACE FUNCTION public.profile_id_for_verified_phone(p_phone text)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id
    FROM auth.users u
   WHERE u.phone IS NOT NULL
     AND u.phone <> ''
     AND regexp_replace(u.phone, '\D', '', 'g') = regexp_replace(coalesce(p_phone, ''), '\D', '', 'g')
     AND regexp_replace(coalesce(p_phone, ''), '\D', '', 'g') <> ''
   LIMIT 1;
$function$;

REVOKE ALL ON FUNCTION public.profile_id_for_verified_phone(text) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.profile_id_for_verified_phone(text) TO service_role;
