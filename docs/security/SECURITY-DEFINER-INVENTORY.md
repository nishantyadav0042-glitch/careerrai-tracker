# SECURITY DEFINER inventory

**Generated 22 September 2026** from production (`pobhpszlsozeonejtzqy`) with
`scripts/security/definer-inventory.sql`. Read-only query; regenerate and paste
the rows whenever a definer function is added or its grants change.

Enforced by `src/lib/security-definer-policy.guard.test.ts`, which fails CI if
a new SECURITY DEFINER function is added without appearing here.

---

## The policy

A `SECURITY DEFINER` function in `public` must satisfy all three, or carry a
documented exception in the table below:

1. **A fixed `search_path`.** A mutable one lets whoever can create a schema
   object decide what an unqualified name inside the function resolves to.
2. **Not executable by `anon`.** Never, without an argument made here first.
3. **Executable by `authenticated` only with a stated reason.** The default is
   no — a signed-in student is not a trusted caller.

`service_role` keeps EXECUTE throughout: every in-app caller reaches these
through the server-side admin client.

### The rule that is not obvious, and has cost this repo twice

**`REVOKE EXECUTE … FROM anon` is a no-op while the function still carries the
default `PUBLIC` grant**, because `anon` inherits PUBLIC. It reports success and
leaves the function callable.

- **12 Jul 2026** — `20260712_revoke_public_execute_definer_fns.sql`, in its own
  words: *"an earlier hardening pass revoked EXECUTE from anon/authenticated …
  but never revoked the default PUBLIC grant. anon inherits PUBLIC, so the
  functions stayed callable via PostgREST RPC — most importantly
  `upsert_log_and_streak`, which let a holder of the public anon key forge ANY
  student's daily log + streak."*
- **22 Sep 2026** — the identical mistake, in `20260922c`. Revoked from `anon`,
  reported success, changed nothing. Corrected by `20260922d`, which revokes
  from `PUBLIC`.

The lesson was written down the first time and repeated anyway. It is now a
test, not a comment.

---

## Live state — 25 functions, none executable by `anon`

| function | trigger | search_path | anon | auth | svc | in RLS |
|---|---|---|---|---|---|---|
| assign_session_credit | | public | ✗ | ✗ | ✓ | |
| business_invariants | | public | ✗ | ✗ | ✓ | |
| claim_lead | | public | ✗ | ✗ | ✓ | |
| claim_otp_send_slot | | public | ✗ | ✗ | ✓ | |
| consume_chat_message | | public | ✗ | ✗ | ✓ | |
| dead_columns | | public | ✗ | ✗ | ✓ | |
| delete_student_account | | public | ✗ | ✗ | ✓ | |
| **enforce_sales_seat_cap** | ✓ | public | ✗ | **✓** | ✓ | |
| guard_exam_ready | ✓ | public | ✗ | ✗ | ✓ | |
| handle_new_user | ✓ | public | ✗ | ✗ | ✓ | |
| increment_buddy_cta | | public | ✗ | ✗ | ✓ | |
| increment_coupon_use | | public | ✗ | ✗ | ✓ | |
| **is_admin** | | public | ✗ | **✓** | ✓ | **✓** |
| notification_outcomes | | public | ✗ | ✗ | ✓ | |
| profile_id_for_verified_phone | | public | ✗ | ✗ | ✓ | |
| refresh_buddy_demo_account | | public | ✗ | ✗ | ✓ | |
| refresh_review_account_logs | | public | ✗ | ✗ | ✓ | |
| rls_auto_enable | | pg_catalog | ✗ | ✗ | ✓ | |
| social_proof | | public | ✗ | ✗ | ✓ | |
| sweep_intervention_outcomes | | public | ✗ | ✗ | ✓ | |
| sweep_notifications | | pg_catalog, public | ✗ | ✗ | ✓ | |
| sweep_telemetry | | pg_catalog, public | ✗ | ✗ | ✓ | |
| **sync_student_crm** | ✓ | public | ✗ | **✓** | ✓ | |
| transfer_sales_book | | public | ✗ | ✗ | ✓ | |
| upsert_log_and_streak | | public | ✗ | ✗ | ✓ | |

Extension-owned functions are excluded. `btree_gist` and `pg_net` are installed
in `public`, so ~90 of their internals (`gbt_int2_same` and siblings) sit in
this namespace. We do not own them and `ALTER FUNCTION` on them fails outright.

---

## The three `authenticated` exceptions

The Supabase advisor flags all three (lint 0029). One of them must not be
changed, and the advisor cannot know that.

### `is_admin(uuid)` — MUST KEEP. Revoking causes an outage.

**Four RLS policies call `is_admin(auth.uid())`, and an RLS policy executes as
the calling role.** Revoke EXECUTE from `authenticated` and every one of them
fails with `permission denied for function is_admin` — which is Incident #14,
by name. `20260707_security_hardening_prelaunch.sql` already recorded this and
revoked from `anon` only, deliberately.

This is the only definer function with `in RLS = true`, and the catalog proves
it rather than anyone remembering it — which is why that column is in the query.

### `enforce_sales_seat_cap()` and `sync_student_crm()` — OPEN QUESTION

Both are `RETURNS trigger`. A direct REST call raises rather than doing
anything, so the practical exposure is low and `anon` no longer has EXECUTE.

**Whether `authenticated` needs EXECUTE at all is unresolved.** PostgreSQL is
generally understood not to check EXECUTE on a trigger function when the
trigger fires — if that holds here, both can be revoked and the finding closes
completely. It was not tested on 22 Sep because the cost of being wrong is a
student unable to save their profile, and the founder had scoped the night.

To settle it, in a transaction that is rolled back:

```sql
begin;
  revoke execute on function public.sync_student_crm() from authenticated;
  -- then, AS the authenticated role, perform a write to public.profiles that
  -- fires the trigger, and see whether it succeeds
rollback;
```

If the write succeeds, revoke for real and delete this section.

---

## What is deliberately not here

`pg_net` and `btree_gist` remain in `public`. Moving an extension rewrites every
dependent object, and `btree_gist` backs exclusion constraints on session
scheduling. That is a dependency-graph, migration-plan, rehearsal and rollback
change — not security cleanup by opportunistic bundling. Founder, 22 Sep:
*"It belongs in a separate investigation."*
