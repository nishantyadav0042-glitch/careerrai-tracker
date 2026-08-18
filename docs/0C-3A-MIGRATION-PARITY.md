# 0C.3a — log-insight migration: parity result

**18 Aug 2026.** Gate 4 of the locked seven-gate sequence.

Contract, as ruled: *"Byte-identical parity. Old implementation and registry
implementation run side-by-side in tests. If: old !== new — STOP. Do not
'improve' the output during migration."*

**The comparison has been built and run. It is `src/lib/log-insight.parity.test.ts`.**

---

## VERDICT: 🟡 PARITY HOLDS FOR 426 OF 427 STUDENTS. STOP FIRED ON THE 427th.

Two things must be ruled before this ships. Neither is a code problem.

---

# PART 1 — WHAT WAS BUILT

`src/lib/log-insight-facts.ts` — `coverageInsightFromFacts()`. A parallel
implementation, **not** an edit of `log-insight.ts`, so both can run on the same
input. Every rung, every tie-break, every character of copy is carried across
unchanged. Only the counting moved:

| Old | Migrated |
|---|---|
| `rows.filter(isOpened).length` | `section_opened_units` |
| `rows.filter(!isOpened).length` | `section_untouched_units` |
| `rows.filter(isAtRevisionDepth).length` | `section_at_depth_units` |
| sum of section opened counts | `syllabus_opened_units` |
| `loggedDaysLast7` computed in the route | `logged_days_last_7` |
| `count(*)` of `daily_reports` | `logged_days_total` |

**The live path is untouched.** `log-daily/route.ts` still calls the old
function; a guard test asserts it does not import the new one while a STOP is
outstanding.

## The parity corpus

**5,760 cells**: 40 deterministic coverage matrices (seeded LCG, never
`Math.random()` — an unreproducible parity failure is worthless) × 12 section
combinations × 6 log-date sets × rest/not-rest. Plus six hand-built boundary
shapes that reach each rung deliberately, a habit-track contamination case, and
the empty-coverage case.

**Result: 0 divergences.** Every one of the eight strings `log-insight` can emit
is byte-identical.

---

# PART 2 — THE STOP: A ROW-COUNT DENOMINATOR

`log-insight.ts` divides by `rows.length` — *"however many `topic_coverage` rows
this student happens to have"*. The registry divides by the section's real size,
because ruling **D1** says the denominator is the canonical syllabus, derived,
never a literal and never a row count.

For 426 of 427 students these are the same number: onboarding seeds all 46 rows,
so `rows.length` **is** 28 / 9 / 9. Verified in production — 426 students match
the canonical count in all three sections, 0 have duplicate topics, and the
distinct topics in QA / VARC / DILR are exactly 28 / 9 / 9.

**One student does not.** `50b0ad71`, joined 26 Jul, 3 logs, last active 26 Jul.
16 rows of 46: 7 QA, 4 VARC, 5 DILR. Rows exist only where a task tick made one —
`/complete-task` upserts a single row on demand, while onboarding seeds the
matrix. **This shape is reachable by any student who skips the onboarding matrix
and then ticks tasks. It is a live path, not legacy residue.**

What the two implementations say to that student:

| Studied today | Today's app says | The registry says |
|---|---|---|
| QA | *"Just 1 QA topic left untouched — the whole section is in sight."* | *"QA: 6 of 28 topics opened — 21% of the section on the board."* |
| VARC | *"Every VARC topic is opened — nothing untouched. Now it's depth, not coverage."* | *"VARC: 4 of 9 topics opened — 44% of the section on the board."* |
| Mock only | *"Across the syllabus: 15 of 16 topics opened (94%)."* | *"Across the syllabus: 15 of 46 topics opened (33%)."* |
| All three | *"Just 1 QA topic left untouched"* | *"DILR: 5 of 9 topics opened — 56%"* |

The QA line is not a percentage that is slightly off. **22 of that student's 28
QA topics have never been touched, and the app tells them the section is in
sight.** The VARC line is worse: it does not report a wrong number, it fires a
wrong *rung* — breadth declared finished, student advised to move to depth, with
5 of 9 topics never opened. The syllabus line overstates by 61 percentage points.

This is the 111% Knowledge defect in a different table: a numerator counted
against whatever denominator happened to be lying around.

**Per the contract I have not adjusted the fact definitions to reproduce the old
strings.** The old strings are the defect.

### The ask

> **Ruling needed:** the registry's canonical denominator replaces `rows.length`,
> which changes what one dormant student would see on their next log and
> corrects a live overstatement for anyone who reaches the partial-seed shape.
> Approve, or rule otherwise.

I recommend approving it. It is not an improvement smuggled in under a
migration — it is the migration finding an Article 5 violation, which is what
the parity harness exists to do.

---

# PART 3 — THE SECOND BLOCKER: TWO UNREGISTERED RATIOS

Two of the eight lines print a **percentage**:

- `"QA: 12 of 28 topics opened — 43% of the section on the board."`
- `"Across the syllabus: 20 of 46 topics opened (43%)."`

Gate 3 registered the five facts my 0C.3 investigation asked for. **That
investigation enumerated the counts these lines need and missed the percentages
they print.** My error, and the same class as the opened-vs-covered miss that
stopped 0C.3a the first time — found the same way, by trying to actually do the
migration instead of reasoning about it.

So `coverageInsightFromFacts` currently computes both ratios inline, each marked
`⚠ BLOCKED` in the source and asserted by a test so it cannot be forgotten. A
ratio produced outside the registry has no declared numerator, denominator or
valid range — Constitution Article 5. **It is written that way so parity could be
measured, not so it can ship.**

### The ask

> **Approval needed** to register `syllabus_opened_pct` and `section_opened_pct`,
> opened-family siblings of the existing `syllabus_coverage_pct`, denominators
> derived from the canonical syllabus, `validRange: [0, 100]`.

One note on ranking, so it is ruled rather than assumed: rung 3 picks the
section with the highest `opened / total`. The migrated code sorts on the
**unrounded** ratio, exactly as the old code did. Sorting on a rounded
percentage would reorder sections the old code did not tie. Selection order is a
rule, not a claim, so it is not rounded — flagging it because it is the kind of
detail that silently changes an output later.

---

# PART 4 — ONE MORE THING THE MIGRATION NEEDS

`log-daily/route.ts` selects `section, status` from `topic_coverage`. The
registry is membership-scoped: it can only refuse an out-of-universe row if it
can see which topic the row names. **The select gains `topic`.**

That is not cosmetic. Scoping by section cannot tell a QA row naming a VARC
topic from a legitimate one; scoping by topic can. Production has no such rows
today (distinct topics per section are exactly 28 / 9 / 9), which is precisely
why nothing has caught it.

Related, and now structural rather than incidental: the route passes `count(*)`
of `daily_reports` as the lifetime day count. That equals the distinct-date
count only because `(student_id, report_date)` is unique — true today, 0
duplicate pairs. `logged_days_total` counts **dates**, so the guarantee stops
depending on a constraint nobody re-checks.

---

# PART 5 — STATUS

| Gate | State |
|---|---|
| Gate 3 — opened / depth / lifetime facts | ✅ green, committed |
| Gate 4 — 0C.3a parity harness built and run | ✅ built, 5,760 cells, 0 divergences on the seeded shape |
| Gate 4 — 0C.3a migration shipped | ⛔ **STOPPED**, awaiting the two rulings above |
| Gates 5–7 | blocked, as ruled |

**Nothing is wired into the live log path. `daily-insight.ts` untouched.
0C.3b / 0C.3c not started.**
