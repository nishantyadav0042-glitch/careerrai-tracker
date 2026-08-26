# Production vs test: the whole-schema inventory

**Run this before trusting any test that touches the database.**

Last taken **26 Aug 2026**. production `pobhpszlsozeonejtzqy` · test `endycmkdphymmhzniaih`.

Written because we kept finding divergence one table at a time — `session_credits`
in Phase 2A, `student_payments`' missing primary key in the same pass,
`video_sessions`' missing `one_live_session_per_pair` during 2C probing,
`mentor_grants`' missing `UNIQUE(student_id)` during the audit. Four discoveries,
four separate incidents, all the same fact. This is that fact, taken once, whole.

---

## The headline

Every one of production's 94 tables **exists** on test. Nothing is missing by name,
which is exactly why this went unnoticed for so long — a table that exists and
accepts writes looks like a table that works.

| | tables | meaning |
|---|---|---|
| Byte-identical to production | **9** | safe to test against |
| Present but divergent | **6** | partially enforced; read the row below |
| **Zero integrity objects** | **79** | no PK, no FK, no unique, no check, no index, no trigger |

**80 of 95 tables on test have no PRIMARY KEY.** 498 production objects are absent.

A test firing at one of those 79 tables cannot fail on an integrity rule, because
there is no integrity rule to fail. It does not prove the code refuses; it proves
nothing, and it *reads* as a pass. That is worse than no test.

---

## Identical (9) — safe

`buddy_availability` · `buddy_time_off` · `intervention_ledger` · `sales_followup` ·
`sales_rep_config` · `session_feedback` · `session_intents` · `student_payments` ·
`video_sessions`

## Divergent (6)

| table | prod | test | note |
|---|---:|---:|---|
| `profiles` | 36 | 2 | 34 objects absent — role, premium, allowlist rules all unenforced |
| `mentor_grants` | 12 | 7 | missing `UNIQUE(student_id)` — the constraint the ₹299 grant relies on |
| `expedify_events` | 11 | 9 | |
| `lead_outreach` | 8 | 6 | |
| `sales_activity` | 13 | 11 | |
| `session_credits` | 19 | 20 | **test is ahead** — carries Phase 2B, which production does not have yet |

## Zero objects (79)

```
admin_audit_log ai_usage_events analytics_events attachment_uploads brain_break_logs
buddy_assignment_queue buddy_briefings buddy_checkin_drafts buddy_feedback buddy_notes
buddy_payouts cat_test_leads challenge_attempts chat_blocks chat_messages chat_reports
client_errors coaching_sessions coaching_target_progress community_reports
coupon_redemptions coupons cron_runs daily_challenges daily_coach_line daily_insight_shown
daily_lrdi_puzzles daily_reports daily_routines decision_log feedback founder_outreach
funnel_events google_oauth_tokens idempotency_keys integration_audit_log login_attempts
lrdi_puzzle_attempts metric_snapshots mock_debriefs mock_drop_alerts
notification_consent_events notification_duplicate_suppressions notifications
otp_send_events perf_events plan_extensions pwa_session_handoff qa_daily_plan
qa_topic_progress rating_prompts recovery_events refund_requests routine_engagement_events
routine_task_completions scholarships security_events server_config session_assignments
session_commitments session_requests streak_data student_allowlist student_channels
student_crm student_dna student_dna_history student_engagement student_events
student_milestones student_submissions student_timetables study_action_log submission_votes
test_results timeline_events todo_items topic_coverage topic_evidence
```

---

## What this blocks right now

The adversarial test round cannot run honestly against test until the tables those
tests touch are restored. Naming them, because "restore all 79" is not the useful
next step:

| planned adversarial test | table it needs | state |
|---|---|---|
| duplicate payment / duplicate callback | `idempotency_keys` | **restored** `20260826e` |
| "3 messages" counted against real rows | `chat_messages` | **restored** `20260826e` |
| duplicate notification / dedup | `notifications`, `notification_duplicate_suppressions` | **restored** `20260826e` |
| refund cannot re-grant | `refund_requests` | **restored** `20260826e` |
| mentor Google connection | `google_oauth_tokens` | **restored** `20260826e` |
| promotion impression, once per day | *(table does not exist yet)* | — |
| booking, credit lifecycle, feedback | `session_credits`, `video_sessions`, `session_feedback` | ready |

**All six restored on 26 Aug and verified three ways** — byte-identical md5 to
production, 15/15 functional probes, and non-vacuity by dropping all ten
protections at once (12/12 attacks became ACCEPTED, then refused again on
restore). See `supabase/tests/audit_gate_constraints_probes.sql`.

The adversarial round is no longer blocked by parity. The other 73 zero-object
tables remain divergent by decision, not oversight: restore what an audit gate
needs, when it needs it.

### The once-per-day pattern already exists

`notifications_once_per_day_per_type` is a UNIQUE index on
`(user_id, type, (created_at AT TIME ZONE 'Asia/Kolkata')::date)` covering 21
notification types. Proved by probe: two sends in one IST day are refused;
23:50 IST and 00:10 IST are correctly different days; uncapped types repeat
freely.

That is the buddy-promotion requirement, already solved, already in production,
for a different surface. The promotion cap needs this mechanism — not a new
one — and the day boundary question is answered: **Asia/Kolkata calendar day**
is the established convention. Being a unique index, it fails CLOSED, which is
exactly where the current `localStorage` throttle fails open.

---

## Take the inventory again

One query, run unchanged against both databases; compare the two `fingerprints`
strings. It needs no extension and writes nothing.

```sql
with sig as (
  select c.conrelid::regclass::text tbl, 'C '||c.conname||' '||pg_get_constraintdef(c.oid) s
    from pg_constraint c join pg_class t on t.oid=c.conrelid
    join pg_namespace ns on ns.oid=t.relnamespace where ns.nspname='public'
  union all select tablename, 'I '||indexdef from pg_indexes where schemaname='public'
  union all select tgrelid::regclass::text, 'T '||tgname from pg_trigger where not tgisinternal
    and tgrelid in (select oid from pg_class where relnamespace='public'::regnamespace)
), per as (select tbl, count(*) n, left(md5(string_agg(s,'|' order by s)),8) fp from sig group by tbl)
select (select count(*) from pg_tables where schemaname='public') as tables,
       (select string_agg(tablename,',' order by tablename) from pg_tables where schemaname='public') as tablelist,
       (select string_agg(tbl||':'||n||':'||fp,' ' order by tbl) from per) as fingerprints;
```

**On restoring anything:** replay the definition verbatim from production's
`pg_get_constraintdef()` / `indexdef` output and re-verify by md5 — never retype it
from memory. Write the array cast as `array[...]::character varying[]` where the
column is `varchar`, or Postgres re-renders it differently and the two schemas look
divergent forever for no reason (learned the hard way in `20260826d`).

---

## Also on test, and not in production

`p6` — a 12-row scratch table (`seq, step, ok, detail`) left behind by an earlier
probe run. Harmless, but it is not in production and nothing in this repo creates
it. Left in place rather than deleted: it is somebody's diagnostic record, and
this document is an inventory, not a cleanup.
