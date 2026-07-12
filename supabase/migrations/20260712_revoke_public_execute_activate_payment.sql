-- Applied via Supabase MCP on 2026-07-12. Recorded here for repo parity.
-- Defense-in-depth: activate_payment is only ever called by the Razorpay webhook
-- through the service-role client, but retained the default PUBLIC EXECUTE grant.
-- Not currently exploitable (SECURITY INVOKER + no user UPDATE policy on
-- student_payments + the guard_privileged_profile_columns trigger blocks the
-- profiles write), but no anon/authenticated caller should be able to reach it.
revoke execute on function public.activate_payment(uuid, uuid, text, timestamptz, text, text) from public, anon, authenticated;
