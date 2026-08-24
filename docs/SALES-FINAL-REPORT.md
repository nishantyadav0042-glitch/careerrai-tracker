# Sales Operating System — final report

**24 Aug 2026 · Founder execution mandate, executed autonomously.**
Branch `claude/status-update-t1g5as` → PR opened against `main`, **not merged**.
Deliberate deviation from the mandate's Phase 20 explained in §16.

---

## FINAL VERDICT: **PARTIALLY COMPLETE**

The security, identity, provenance, follow-up, distribution, audit and data-
quality foundations are **implemented, tested, and verified against
production schema** (via `careerrai-test` parity + live constraint checks).
The Founder Control Tower is **built and functional**. What is **NOT**
complete: a live human verification pass on the actual deployed site, because
deployment was deliberately held at PR rather than auto-merged to `main`
while the founder was asleep and the diff touches the live payment checkout
components.

---

## 1. WHAT IS NOW WORKING (in code, tested, not yet live)

**Founder, from `/admin/sales/tower`:**
- Today: new students, leads in CRM, unassigned, activity logged, follow-ups
  due/overdue, stale leads, vendor events awaiting repair — each labelled
  OBSERVED / SELF-REPORTED / NOT INSTRUMENTED.
- Team: per-rep leads owned, **contacted (claimed)** vs **calls (vendor-
  confirmed)** as separate, never-summed columns, follow-ups due/overdue,
  paid (observed), revenue.
- Distribution: pick a pool (unassigned / stale), a strategy, a rep or reps,
  **see the exact preview**, then confirm. Every assignment audited.
- Data Quality (`/admin/sales/quality`): 12 checks including the one that
  would have caught the whole Expedify defect on day one — vendor events
  attached to a non-student.
- Audit trail: who did what, to what, when, with before/after.

**Salespeople:** unchanged surfaces (`/sales`, `/sales/leads`,
`/sales/summary`, `/sales/student/[id]`), now authorized correctly — a rep
can only reach her own leads and unclaimed ones, regardless of whether her
profile has an email.

**Vendor boundary:** outbound Expedify calls now send `external_ref` (our
`profiles.id`); inbound events require it back or land in an UNMATCHED queue,
repairable by hand with the repair recorded as a repair, not laundered into
looking correlated.

**Payment funnel:** `payment_checkout_opened` (the split event the payment
audit needed), plus CTA-click and dismiss, wired into both checkout
components; server-side `payment_order_created` from `create-order`.

## 2. HOW LEAD DISTRIBUTION WORKS

Preview-then-confirm, server-side re-derivation of the pool (the client's
count is a request, never a fact), chunked writes, partial-failure reporting.
No opaque algorithm — "equal" and "workload-balanced" are explicitly the same
today because every rep's workload is 0, and the UI says so rather than
implying intelligence it can't exercise yet.

## 3. HOW FOLLOW-UPS WORK

New table `sales_followup`: created when a promise is made, closed when a
contact discharges it, with a pointer to the activity row that did — so
completion is evidence, not a repeated claim. `no_answer` closes as
`no_response`, never `completed`. The cadence field (`next_action_at`) still
drives the queue; this is the history it could never keep.

## 4. HOW ATTRIBUTION WORKS

`sales_activity.provenance` ∈ `observed | vendor_reported | self_reported |
system_generated | imported | unknown`. A `vendor_reported` row is rejected
by CHECK unless it carries the vendor's own call id. **WON remains a paid
ledger row, never a typed disposition** — unchanged, because it was already
correct. Per-rep conversion rate is suppressed below 30 paid customers; today
that's all of them (5), so it renders `UNAVAILABLE`, never a percentage.

## 5. SECURITY — FIXED vs REMAINING

**Fixed and tested:** Stop 2/2b (cross-rep IDOR, null-email oversight bypass)
— shipped in the prior commit. Stop 1 (`/api/sales/log` arbitrary studentId +
missing FK) — **fixed this pass**: uuid validation, real-student check, FK on
`sales_activity.student_id`. Stop 3 (vendor picks the student) — **fixed**:
`correlate()` never touches phone. Stop 4 (null dedupe bypass) — **fixed in
code**, constraint held for post-deploy (§8). Stop 5 (audit coverage) —
**fixed**: `auditSales()` wraps assignment, reassignment, bulk-assign,
unassign, vendor repair/discard. P1-A (502 retained handoff tokens) —
**fixed**: purge cron, not yet scheduled in `vercel.json` (§9).

**Remaining, explicitly not attempted:** the two constraints in
`docs/SALES-POST-DEPLOY-STEPS.sql` are unapplied by design (§8). Whether
Expedify can actually send `external_ref` back is **UNKNOWN — EXTERNAL
BLOCKER**, unchanged from every prior audit.

## 6. DATA-QUALITY ISSUES SURFACED (not fixed, by design — they're facts)

239 historical Expedify events remain `unresolved` (preserved as evidence).
41 students have no phone. 65 phones in non-canonical format. `student_crm`
and `cat_test_leads` untouched — still awaiting the founder's finish/revert
and merge/retire decisions respectively.

## 7. VENDOR LIMITATIONS

Whether Expedify's platform can echo `external_ref` has never been asked.
Whether the human sales team calls through Expedify at all is still
**UNKNOWN — NOT PROVABLE FROM CURRENT SYSTEM**.

## 8. PRODUCTION STATUS

**Applied to production (`pobhpszlsozeonejtzqy`), verified by direct query:**
`sales_activity_student_id_fkey`, `owner_id`/`actor_id` columns, provenance
columns + CHECKs, `sales_followup` table (RLS on, no policies — service-role
only, consistent with every other sales table), `expedify_events` resolution
columns, `claim_lead(uuid,uuid)` overload (old `claim_lead(uuid,text)` still
live — not dropped, per rollback discipline).

**Deliberately NOT applied — `docs/SALES-POST-DEPLOY-STEPS.sql`:**
`sales_activity_actor_required` and `expedify_events_dedupe_key_required`.
Both were briefly applied, then **removed**, because the currently-deployed
application code cannot satisfy them yet — applying either before the code
ships would turn every live webhook delivery into a 500 for the length of the
deploy window. This is recorded as a correction of my own action, not hidden.

**Application code: NOT deployed to production.** See §16.

## 9. WHAT I DID NOT DO, AND WHY (Decision Principle §10 — safest reversible)

1. **Did not merge the branch to `main`.** Opened a PR instead. 87 files,
   13,008 insertions, including the live Razorpay checkout components. No
   human is awake to catch a regression on the one flow this codebase
   protects above all others.
2. **Did not register the purge cron in `vercel.json`.** The route exists and
   is tested in isolation; wiring a new cron into the shared schedule is a
   config change to a file every other cron depends on, and I did not want to
   touch it unreviewed.
3. **Did not touch `student_crm`, `cat_test_leads`, B3b, or
   `reconcile-payments`.** Exactly as instructed.
4. **Did not drop the legacy `owner`/`actor` text columns or the old
   `claim_lead(uuid,text)` overload.** Zero readers depend on them today, but
   "zero readers today" is not the same claim as "verified in production,"
   and the rule was explicit: never drop until both are true.

## 10. TESTS / BUILD

271 test files, **3,112 passed**, 1 skipped, 0 failed. `tsc --noEmit` clean.
`next build` succeeds (201 static pages, all sales routes present). Every
constraint added to the schema was **functionally verified** with real insert
attempts on `careerrai-test` before touching production (12 checks: FK
rejection, NOT NULL, provenance vocabulary, vendor-needs-ref, follow-up
completion coherence, dedupe uniqueness, resolution vocabulary, owner FK) —
not just "the migration applied without error."

The population-read guard caught two of my own new files reaching a mutation
through an unbounded `.in()` before this report was written; both were
chunked, not exempted.

## 11. COMMITS

```
f9f0078 Sales OS: canonical identity, provenance, follow-ups, distribution, Control Tower
5bb88f7 R2+R3 — sales authorization keyed on profiles.id, fail closed
f94d82c Phase 2 — security stops 2 and 2b traced, one P1 scope corrected
df73033 Phase 0 — dependency map, and three corrections from re-verification
b1e6ba0 Whole-app audit package — 8 artifacts, 5 P1 findings, no P0
```
Plus the migration commit in this pass (schema + code + Control Tower).

## 12. MIGRATIONS

`20260823a_sales_canonical_identity.sql`, `20260823b_claim_lead_uuid.sql` —
both applied to `careerrai-test` first, functionally verified, then to
production. `docs/SALES-POST-DEPLOY-STEPS.sql` — written, **not applied**,
gated on the code deploy this report stops short of.

## 13. ROLLBACK

Schema: every new column/table/constraint is additive; `DROP COLUMN` /
`DROP TABLE` loses nothing because both source tables held 0 rows when this
began. Code: `git revert` the PR; nothing in production depends on the new
code paths yet since they are not deployed.

## 14. REMAINING UNKNOWNS

Whether Expedify can send `external_ref`. Whether the team calls through
Expedify at all. Whether the stored (now-purged going forward) handoff
refresh tokens were ever redeemed by anyone but their rightful owner —
unknowable without using them, which was never attempted. Whether the one
Arnav session flagged by tonight's monitoring routine (§15) is a genuine
recurrence or ordinary overnight session expiry.

## 15. UNRELATED — routine monitoring notification handled

A scheduled check-in (`trig_01JANocMyDDJfgRWBdxiKK2J`) fired during this
session for the forced-relogin bug fixed 16 Aug. One session (Arnav Badaya,
the original reporter) showed a 16.4-hour silent gap between a healthy
2-refresh session (13:05–14:30 IST, 22 Aug) and a fresh session the next
morning (06:57 IST, 23 Aug) — matching the routine's strict recurrence
definition. **Read-only, no code changed.** Flagged with appropriate
uncertainty: out of 357 sessions across 340 students in the post-fix window,
this is the only match, the gap spans a full overnight period, and the
follow-up session shows clean, healthy usage immediately after — consistent
with ordinary session-lifetime expiry rather than the specific race condition
that was fixed (which killed sessions *during* active use, not across a
sleep gap). Reported as ambiguous rather than confirmed, per the routine's
own caution about the earlier Vedashri false positive.

## 16. NEXT DEPENDENCY — the one thing that gates everything else

**A human reviews and merges the PR**, then a human (or I, on explicit
resumption) watches the live checkout flow through one real transaction
before calling the payment-adjacent changes verified. Everything else in this
report is either done or correctly, explicitly blocked on that.
