# Production Readiness Gate — `claude/status-update-t1g5as` → `main`

Co-founder rule, 9 Aug: *no merge unless every item is green, and don't treat
71 commits as one atomic deploy.*

This is not a checkbox doc. Every row names the **evidence** — a passing test, a
live DB query, or an explicit human decision — so "green" is a fact, not a
feeling. Captured 9 Aug at HEAD `242257f`, 863 tests passing, `tsc` clean.

---

## The two-phase merge (my call as co-founder)

The 71 commits are a **linear history**, and the shape is a gift: the operating
system is the newest contiguous block (`d149d06`..`242257f`, 9 commits), and
everything below it is product + the critical production fixes. So the phases
ChatGPT wanted fall out naturally — no cherry-picking, no history rewrite.

| Phase | Range | What | Risk |
|---|---|---|---|
| **A** | base..`5826f9d` | Positioning, the whole study-plan work, the audit, and **every P0 fix** (payment, cron, sessions, security, telemetry) | Higher — it touches money and the plan. Deploy, then watch for a full day. |
| **B** | `d149d06`..`242257f` | The **operating system** (workspaces, inbox, graph, 360s, timeline, AI cost, pipeline) — all admin-only, zero student-facing paths | Lower — a bug here hurts *me*, not a student. Deploy after A is proven. |

Phase A is where the student-facing risk lives, so it goes first and alone.
Phase B is admin-only; it cannot regress a student journey, so it follows once A
is quiet.

**Merge A only when every P0 row below is green. Merge B only when A has run
clean for 24h.**

---

## Tier 1 — must be green before Phase A merges

| Item | Evidence | State |
|---|---|---|
| Payment surface (iOS/Android/web) | `src/lib/payment-surface.test.ts` — 15 checks incl. the iOS-PWA-0-payments case | ✅ green |
| Browser hand-off (`/go`) | same file — "must prove it reached a browser before acting like one" | ✅ green |
| Premium unlock is webhook-truth | `src/lib/razorpay.test.ts` — 13 checks, signature boundary | ✅ green |
| Founder alert on stuck unlock | `src/lib/os/sacred-guard.test.ts` — self-heal-then-escalate | ✅ green |
| Study plan A→Z, no overload | `src/lib/az-journey.test.ts` — 14 checks, both journeys | ✅ green |
| Coaching timetable mapping | same file — "class topics on class dates" door passes | ✅ green |
| Cron timeout / silent tail | `src/lib/cron-sweep.test.ts` — bounded, deadline-reported | ✅ green |
| Session release + mentor escape | `src/lib/session-link.test.ts` (18 checks) | ✅ green |
| Storage security policy | live query: blanket `Authenticated can upload` policy **dropped**; every bucket now size+MIME capped | ✅ verified live |
| AI produced on tap only | `src/lib/ai-on-tap.guard.test.ts` — no AI inside a cron | ✅ green |

## Tier 2 — the operating system (Phase B)

| Item | Evidence | State |
|---|---|---|
| No orphan admin pages | `src/lib/admin-workspaces.test.ts` — one home per page, enforced | ✅ green |
| Entity graph matches schema | `src/lib/os/entity-graph.test.ts` — symmetric + column-verified | ✅ green |
| Command palette routes exist | `src/lib/os/universal-search.test.ts` | ✅ green |
| Timeline = decisions not logs | `src/lib/os/timeline.test.ts` — noise kinds forbidden | ✅ green |
| Student priority ranking | `src/lib/os/student-priority.test.ts` — 15 checks | ✅ green |

## Cross-cutting

| Item | Evidence | State |
|---|---|---|
| Full test suite | `npx vitest run` → **863 passed, 1 skipped, 0 failed** | ✅ |
| Typecheck | `npx tsc --noEmit` → **0 errors in src/** | ✅ |
| Database migrations applied | live: `timeline_events`, `ai_usage_events`, storage policy, coaching_sessions, bad_day_floor all present | ✅ verified live |
| English-only | `src/lib/english-only.guard.test.ts` | ✅ green |

---

## The one RED item — and it is a human decision, not a bug

**Rollback plan.** A code merge to `main` is reversible by Vercel Instant
Rollback (proven today — that is how the production outage was going to be
recovered). But **five migrations are already applied to the live database** and
are NOT rolled back by a code revert:

- `timeline_events`, `ai_usage_events` — additive, empty, harmless if the code
  that reads them is rolled back. **No action.**
- `20260809a_scope_storage_upload_policy` — dropped the over-permissive storage
  policy. Rolling the CODE back does not re-open the hole (good), but if you
  ever roll this migration back you re-expose it. **Leave it.**
- `bad_day_floor`, `coaching_sessions` — already live and already relied on by
  production data written since. **Not reversible without data loss; do not
  revert.**

**The rollback plan is therefore: revert code via Vercel Instant Rollback; do
NOT revert migrations.** That is safe because every migration is either additive
or a security tightening. This row is GREEN once you have read and accepted that
sentence — which is a founder decision, so I have left it for you rather than
ticking it myself.

---

## My final call

Every code and data item is green. The only open item is your acceptance of the
rollback stance above. On that acceptance:

1. **Merge Phase A**, deploy, and watch the Founder Digest + `/admin` for a full
   day — specifically the sacred-guard alerts and the payment surface.
2. If A is quiet, **merge Phase B**.
3. Do not merge both in one push. The point of the split is that if something
   moves wrong, you know which half moved it.

I will not push to `main` without your explicit "go" — a merge affecting 258
live students and everyone onboarding tomorrow is your call to trigger, not
mine to assume.
