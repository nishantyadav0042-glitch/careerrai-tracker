# CareerRai — Master Execution Audit

**19 Aug 2026.** One file, updated per gate. Supersedes the per-gate summaries
as the source of truth for what was done, what is live, and what is not.

Evidence labels are mandatory: `[PRODUCTION]` `[MAIN]` `[BRANCH]` `[INFERENCE]`.

---

## Standing state

| | |
|---|---|
| main / origin/main | `61a6c17` |
| Last verified production SHA | `e91c86e` (`dpl_EZYxG1…`), `61a6c17` deploying |
| `daily_reports` rows | **342** `[PRODUCTION]` |
| `study_duration_source` non-NULL | **0** — no backfill, ever `[PRODUCTION]` |
| `day_outcome` NULL | **142**, classified below `[PRODUCTION]` |
| `upsert_log_and_streak` overloads | 1, SECURITY DEFINER, `search_path=public`, ACL intact `[PRODUCTION]` |
| G13-A3 first real provenance write | **SAMPLE NOT YET OBSERVED** |
| G12 nudge events | 2 (1 shown, 1 `maybe_tomorrow`) — n=1, no conclusion `[PRODUCTION]` |

---

## G14-4A — `day_outcome` persistence forensic  ·  STATUS: PASS (no fix warranted)

**The 142 blanks are structural, not lost writes.** `reviewUpdate` writes
`day_outcome`, `plan_fit`, `blocker_reason` and `confidence` in ONE statement,
so their co-presence discriminates a failed write from a question never asked.

| Class | Rows | Evidence |
|---|---|---|
| Never asked — predates the feature | **62** | column first populated 25 Jul `[PRODUCTION]` |
| Never asked — tick path | **34** | `complete-task` writes the RPC only, never `reviewUpdate` `[MAIN]` |
| Ran, carried no outcome | **36** | sibling fields ARE set — the statement demonstrably succeeded `[PRODUCTION]` |
| Genuinely indeterminate | **10** | → handed to G15/A1, NOT reopened here |

**Failures are observable and none occurred.** `[log] review-signal update
failed` appears in **zero** of 32 error groups over 7 days, and the aggregator
provably captures `console.error` from that same route (58 `Logging error: {`
entries from `log-daily`, 10–12 Aug, all the pre-decimal-hours bug since fixed).

**Ruling applied:** do not harden the fire-and-forget mechanism as though it
were a proven failure. It is a real design weakness with a measured rate of
zero. Recorded for a later hardening gate; not this one.

**Do not reclassify or backfill any of the 142.**

---

## Gate 1 — Admin "plan sized to" claim  ·  STATUS: PASS, deployed

**The claim was objectively false** `[MAIN]`:

- `capBudget()` — the only function applying `sustainableHours` to a proposed
  plan — has **zero callers** (its definition plus one doc-comment mention).
- Plans are sized by `dailyHours(profile)` (`plan-day.ts:92`).
- `sustainableHours` is otherwise consumed only as `capacityGapHours`, a
  displayed **difference**, in three places — never to size anything.

**Fix:** removed the badge. Not relabelled — no new claim replaces it. Nothing
lost but the sentence: entered / studies~ badges, the trust colour on the card,
and `capacity.note` all survive. `capBudget` itself kept — intended future
wiring, not dead code.

**Guard is a two-way coupling, not a ban.** The claim is wrong *while nothing
consumes the value*; if `capBudget` is ever wired in it becomes true and may
return. A flat "this text must never exist" test would later fail for the wrong
reason and invite its own deletion.

4 tests (red first) · suite 2038 · tsc/lint/build clean · admin-only, zero
student-facing surface.

---

## Gate 2 — Parked workstream disposition  ·  STATUS: PASS (audit only)

**Neither workstream may be merged. Neither may be deleted.** Both preserved on
`claude/status-update-t1g5as`.

### (b) Fact Registry / Metric Constitution — **RE-CUT**

Better than its commit titles suggest, and **architecturally aligned with what
we built today rather than competing with it**.

- **Problem it solves** `[BRANCH]`: an audit found 11 implementations of
  syllabus coverage, 15 of logged days, 6 consistency formulas, 5 definitions of
  "today", and a percentage that reached 111% in production. It is the *general*
  solution to the duplication the full-system audit found *empirically*.
- **Three enforced rules**: different meaning → different key; **UNKNOWN is a
  first-class answer** (never estimate, never default to zero); evidence is
  never laundered (out-of-universe input → UNKNOWN + recorded violation).
- **`observed_day_outcome`** splits the student's declaration from CareerRai's
  own tick record, and can only ever answer `studied`/`partial` — never
  `skipped`/`not_studied`, because absence cannot be observed. **That is the
  same reasoning as A3's `WORK_HAPPENED` union, reached independently.**
- **Interaction with A3**: complementary, not competing. A3 reads the
  *self-reported* column; this is the *observed* signal.
- **Interaction with G13-A**: same principle (provenance recorded, nothing
  laundered) one layer up.
- **Interaction with Q3**: **this is the machinery Q3 needs.** UNKNOWN as a
  value rather than a sentinel.
- **Dependencies**: `topic_evidence.logged_for` — **exists in production**,
  `NOT NULL`, 22 rows `[PRODUCTION]`. Imports `completion-portion` from (c), so
  **(b) depends on (c)**.
- **Blocker to shipping**: written before A3 and G13-A landed; must be re-cut,
  not lifted.

### (c) Partial Completion / P0-C / rating — **SPLIT: RE-CUT core, RETIRE rating**

- **`completion-portion.ts` is an interpretation authority over `confidence =
  'blue'`, which main already writes** (`LoggingModal.tsx:166`) `[MAIN]`. It is
  not a competing storage mechanism.
- **Founder ruling already embedded**: a half-tick is PARTIAL, never fully
  complete. Before it, one function read the same tap three ways four lines
  apart — hours 0.5 (right), coverage one rung (right), day closure FULLY DONE
  (wrong, and contradicting the label the student reads).
- **The `portion` column is dead** `[PRODUCTION]`: shipped 12 Aug, **0 rows**,
  and `completion-portion.ts` reads `confidence` instead. Two storage
  mechanisms for one concept, one of them unused — a cleanup-gate item.
- **`blue` has never been written in production**: green 241, null 29, red 2,
  **blue 0** `[PRODUCTION]`, despite main writing it and the CHECK accepting it.
- **The rating sub-feature is not deployable**: `/api/rating-prompt/show` and
  `/resolve` require the `rating_prompts` table, which **does not exist in
  production** `[PRODUCTION]`; its migration is one of the two never applied.

### Disposition summary

| Workstream | Verdict | Blocking condition |
|---|---|---|
| (b) Fact Registry | **RE-CUT** | must re-cut against post-A3 / post-G13-A main; depends on (c)'s `completion-portion` |
| (c) core partial-completion | **RE-CUT** | `completion-portion` is a leaf and re-cuts cleanly; `portion` column disposition → cleanup gate |
| (c) rating prompts | **RETIRE or ship with its migration** | needs a table production does not have — founder call, not urgent |

**No founder decision is required to continue.** Neither is a Q3 dependency:
Q3 concerns study *duration* semantics, and the registry would be the eventual
home for that logic rather than a precondition for it.

---

## NEXT GATE: Q3
