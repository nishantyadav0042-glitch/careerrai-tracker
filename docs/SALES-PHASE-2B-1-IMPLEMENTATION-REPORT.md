# Phase 2B-1 — Implementation Report

**24 Aug 2026 · Configuration + capacity visibility. OBSERVATION ONLY.**
Built against `docs/SALES-PHASE-2B-FINAL-GATE.md` after founder approval.

---

## 0. The confirmation that matters most

**Zero student ownership or assignment was changed, automatically or
otherwise.** Verified in production immediately after deploy of the schema:

```
lead_outreach total rows                     0
lead_outreach with an owner                  0
sales_activity rows                          0
sales_activity assignment events             0   (activity_type assigned/reassigned)
sales_rep_config rows                        0   (awaiting the founder's numbers)
staff accounts (sales|admin)                 2
sales_rep_config CHECK constraints          19
sales_rep_config RLS enabled              true
```

There is no code path in this phase that can set `lead_outreach.owner_id`.
Verified structurally, not just by intent:

- `src/lib/sales-capacity.ts` — `owner_id` appears three times, all **reads**
  (`select`, `.in('owner_id', …)`, and reading the value off a row). The
  module contains **no** `.update(` / `.upsert(` / `.insert(` / `.delete(` /
  `.rpc(` call at all.
- `src/app/api/admin/rep-config/route.ts` — `owner_id` appears once, in a
  **comment** explaining why it is never written. The route queries exactly
  two tables: `profiles` (to verify the target is staff) and
  `sales_rep_config` (the write).
- Guard tests pin both properties so a later phase cannot quietly relax them.

---

## 1. What changed

| File | Class | What it does |
|---|---|---|
| `supabase/migrations/20260824c_sales_rep_config.sql` | NEW | The one new table: per-rep operational configuration |
| `src/lib/sales-capacity.ts` | NEW | Pure capacity math + the OWNED/ACTIVE/DORMANT/CLOSED classifier + a bounded reader. Read-only. |
| `src/app/admin/sales/capacity/page.tsx` | NEW | Founder capacity screen |
| `src/app/admin/sales/capacity/capacity-panel.tsx` | NEW | Per-rep numbers with click-through drill-down |
| `src/app/api/admin/rep-config/route.ts` | NEW | The only write this phase adds — admin-only, bounds-validated, audited |
| `src/lib/sales-capacity.guard.test.ts` | NEW | 28 tests incl. the observation-only boundary |
| `src/app/admin/sales/capacity/capacity-panel.render.test.tsx` | NEW | 5 render tests — the missing test class from C0 |
| `src/lib/call-queue.ts` | EXTEND | `RETENTION_LANES` exported (see §7) — no ranking change |
| `src/lib/sales-audit.ts` | EXTEND | `rep_config_updated` action + `'rep'` target type |
| `src/lib/admin-workspaces.ts` | EXTEND | Capacity tab in the Sales workspace |
| `src/app/sales/page.tsx` | EXTEND | One line: the rep's own capacity. Queue behaviour unchanged. |
| `vitest.config.ts` | EXTEND | `src/**/*.render.test.tsx` — see §5 |

## 2. What was reused (nothing rebuilt)

`classifyLane` (the lane authority — capacity consumes its verdict and
implements no predicate of its own) · `lead_outreach` · `sales_activity` ·
`sales_followup` · `profiles.id` identity · `sales-authz` principal resolution ·
`admin_audit_log` via `auditSales` · `chunkIds` from `truth/batch` ·
`WorkspaceShell` · `requireAdmin`/`requireSales`.

## 3. What was NOT touched

`buildCallQueue` ranking · `claim_lead` · dispositions/vocabulary ·
`sales-followup` logic · `/api/sales/log` · `distribute-leads` ·
`reassign-lead` · every student-facing surface · `student_crm` ·
`cat_test_leads` · Expedify. **Shared-pool manual claiming behaves exactly as
it did before this phase.**

## 4. Database changes

One new table (`sales_rep_config`), 8 CHECK constraints, RLS on with no
policies (service-role only), client writes revoked. **No column added to any
existing table. Nothing dropped. No cron. No RPC.**

Applied to `careerrai-test` first, **functionally verified with 11 real insert
and update attempts**, then to production.

**A defect this verification caught in my own migration:**
`array_length('{}', 1)` returns `NULL`, not `0`, and a CHECK constraint
**passes** when its expression is NULL. My original `work_days` constraint
would therefore have **accepted an empty array**, silently configuring a rep
who is never inside their own working window. Fixed with `coalesce(…, 0)` and
re-verified. This is the same NULL-walks-past-a-constraint class as the
Expedify dedupe key — and it is exactly why constraints are tested with real
statements rather than "the migration applied without error".

## 5. Tests

**3,173 passing** (+33), 1 skipped. `tsc --noEmit` clean. `eslint` clean
(0 errors, 0 warnings on changed files). `next build` succeeds; both new
routes present.

Covered, including every case the founder listed: 0/50 · 25/50 · 50/50 ·
58/50 overflow · dormant excluded · ceiling 50→30 · two reps with different
ceilings · daily cap exhausted · working-hours boundary · non-work day ·
leave · expired override · NOT_CONFIGURED · INACTIVE · closed leads never
counted · **no assignment occurs** · **no ownership changes**.

**A structural gap fixed, not worked around:** vitest's include patterns were
`src/lib/**/*.test.ts` and `src/app/api/**/*.test.ts` — meaning **a render
test was impossible to write in this repo.** That is the structural reason C0
(a page that threw for any student with a mock debrief) shipped while 3,124
tests passed. Added a narrow third category, `src/**/*.render.test.tsx`, so
the defect class is testable at all. React throws when an object reaches JSX,
so rendering a component against representative data is the cheapest possible
catch.

## 6. Rendered UI verification

**Not claimed from a passing test suite.** Two independent checks:

1. **Component render** (`capacity-panel.render.test.tsx`): the panel rendered
   via `renderToStaticMarkup` against representative data — a configured rep
   with work items, **a rep 8 units over capacity**, and an unconfigured rep.
   Asserted: renders without throwing, no `[object Object]`, no `undefined`,
   no `NaN`; NOT CONFIGURED renders as missing setup rather than zero; the
   overflow copy states that nothing was transferred; the drill-down button
   offers exactly `workItems.length` students (count == list, structurally —
   the count *is* the array length).
2. **Route render** against a local dev server: `/admin/sales/capacity`,
   `/sales`, `/admin/sales/tower` all responded `307` (the auth gate
   redirecting an unauthenticated request) with **no server-side render error
   in the log**.

**Honest limitation:** check 2 proves the routes exist and the auth gate
fires; it does **not** prove the authenticated page renders with real data,
because an authenticated session cannot be established in this environment
(`SUPABASE_SERVICE_ROLE_KEY` is absent — a standing environment gap). Check 1
is what actually covers the C0 class. **The first authenticated load of
`/admin/sales/capacity` is still an unverified step and is listed in §9.**

## 7. Duplication check (re-run after implementation)

| Concept | Definitions found | Verdict |
|---|---|---|
| `classifyLane` | 1 | canonical |
| `scoreConversion` | 1 | canonical |
| `resolveFocusSections` | 1 | canonical |
| `buildCallQueue` | 1 | canonical |
| `LEAD_STATUSES` | 1 | canonical |
| `assignableNow` (capacity) | 1 | new, no prior implementation existed |
| ownership writers | 3 routes, unchanged | `sales/log`, `distribute-leads`, `reassign-lead` |

**One design decision worth recording.** `RETENTION_LANES` deliberately
**excludes the conversion lane** from active work. `buddy_cta_clicks` is a
cumulative counter that never resets, so a student who tapped the buddy option
once in July would sit in the conversion lane forever — and counting that as
active work would consume one of their rep's capacity units **permanently**,
which is the exact failure the working-set model exists to prevent (and the
same reason `wants_mentor` was excluded at the architecture stage). Retention
lanes are transient: they clear when the student logs. Genuine conversion work
is still counted, as a first contact or a scheduled follow-up — events that
end, rather than a flag that never does.

## 8. Known limitations

1. **Authenticated page render unverified** (§6). First real load is a
   founder step.
2. **A4 is computed live, not stamped.** The architecture gate specifies an
   `attention_since` stamp written by a lane sweep; that sweep is 2B-2. Until
   then capacity computes the retention lane live for owned leads only —
   correct, and bounded by the book rather than the roster, but it re-reads
   log history per capacity view. Fine at 0–100 owned leads; the stamp
   replaces it in 2B-2.
3. **`assignableNow()` exists but nothing calls it to move a student.** It is
   there so the founder can see available capacity before automation exists.
4. **Capacity cannot be edited from the UI yet** — the audited API route
   exists; a form is 2B-2. Configuration today is an API call.
5. **Unverified: the data-API row limit** (architecture gate §16). Unchanged
   from the gate; the capacity reader is chunked and bounded, so it is not
   exposed to it, but momentum still is.
6. **`getRosterMomentum` fan-out** remains P1 debt, untouched by this phase by
   design — the capacity module deliberately does not call it.

## 9. What the founder does next

1. Open `/admin/sales/capacity` — it will honestly say **no rep is
   configured**, because none is.
2. Send the eight numbers (per rep: work days, hours IST, max active units,
   max new/day, first-contact SLA). I configure both via the audited route.
3. Watch the panel against real data before approving 2B-2.

**Stopping here. 2B-2 (SLA + lane sweep) will not begin without approval.**
