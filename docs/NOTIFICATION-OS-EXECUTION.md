# CareerRai Notification OS — Execution Manual

> **Purpose:** how to build and validate against the Constitution
> (`docs/NOTIFICATION-OS.md`). The Constitution says *what* the OS is; this says
> *how* to change it safely. Every notification change starts by reading the
> Constitution, then follows the workflow below. A change is not "done" until the
> Founder Acceptance Checklist (§9) passes.

---

## 1. Workflow for any notification change

1. **Read the Constitution.** Identify which principles the change touches.
2. **Gap analysis.** What does the current implementation do vs what the
   Constitution requires? Name the gap in one sentence.
3. **Architecture-violation check.** Does the change break any §2 non-negotiable?
   If yes, stop and escalate — do not ship a violation.
4. **Risk analysis.** What breaks if this is wrong? Who becomes unreachable?
5. **Implementation** (§2–§7 below).
6. **Validate** (§8) → **deploy** (§6) → **verify in production** with real data.
7. **Update the Constitution** only if the *principles* changed (rare).

---

## 2. Where things live (the map)

| Concern | File |
|---|---|
| Decision gate, state machine, budgets | `src/lib/notification-os.ts` |
| Low-level send + 10/day cap + 410 handling | `src/lib/push.ts` |
| Client subscribe/persist (the ONLY way) | `src/lib/push-client.ts` |
| Silent self-heal on app open | `src/components/push-healer.tsx` |
| In-app permission ask (the ONLY ask) | `src/components/standalone-notif-ask.tsx` |
| Health scoring + reliability metrics | `src/lib/notification-health.ts` |
| Delivery beacon (device receipt) | `src/app/api/push/received/route.ts` |
| Click beacon | `src/app/api/push/click/route.ts` |
| Welcome/verification push | `src/app/api/push/welcome/route.ts` |
| Subscribe persistence + lifecycle stamps | `src/app/api/push/subscribe/route.ts` |
| Daily guarantee (behaviour-driven) | `src/app/api/cron/daily-heartbeat/route.ts` |
| Command center | `src/app/admin/notification-health/page.tsx` |
| Cron schedule | `vercel.json` |

---

## 3. Data model & contracts

**`profiles`:** `push_subscription`, `push_context` (standalone|browser),
`push_subscribed_at` (first ever), `push_resubscribed_at` (last persist),
`push_verified_at` (last device receipt), `push_died_at`, `notif_prefs` (jsonb:
`push`, `daily_reminder`, `email`, time).

**`notifications`:** `type`, `title`, `body`, `data.url`, `channel`, `read`,
`reason` (required), `expected_action` (required), and the stage stamps
`created_at` → `pushed_at` → `received_at` → `clicked_at`.

**Contracts:**
- Every `dispatch()` call passes `reason` + `expectedAction`. No anonymous sends.
- New `type` values register in `STUDENT_BUDGET_TYPES` (notification-os.ts) or
  they escape the budget — a bug.
- Beacons (`/received`, `/click`) are unauthenticated by design (the SW may hold
  no session), UUID-gated, set-once, never read data back out.

---

## 4. Reliability & idempotency

- **Retry policy:** push send retries once on transient failure; 410/404 is
  terminal (never retried) and stamps `push_died_at`. Client persist retries once.
- **Idempotency:** one-shot broadcasts use a per-channel marker row; a re-run is
  a no-op. Test/verification endpoints are idempotent per `type` per student.
- **Self-heal is the norm:** the healer reuses a healthy sub, rotates only on
  confirmed death or key change. Never add a code path that unsubscribes a
  healthy subscription.

---

## 5. Permission (the fragile part — change with extra care)

- The ask exists in **exactly one place**: `standalone-notif-ask.tsx`, standalone
  mode only, after the first insight. Do not add a browser-tab or pre-install
  ask. Do not add a second in-app ask.
- After a successful subscribe: fire `/api/push/welcome` and let the beacon
  confirm receipt. "Subscribed" is not "verified."

---

## 6. Deployment & rollback

- Develop on the working branch; **main-only deploys** to Vercel. Merge to `main`
  to release; confirm the deployment reaches `READY`.
- **Rollback:** revert the commit and re-merge to main. UI-sequencing changes
  (e.g. permission timing) are single-commit reverts. Subscriptions in the DB are
  never destroyed by a rollback.
- **Feature-flag** risky behavioural changes (env var or `server_config`) so they
  can be disabled without a deploy.
- **Migrations** via Supabase; additive columns only for lifecycle stamps;
  backfill in the same migration; never drop a column another release still reads.

---

## 7. Monitoring, alerts, incident playbook

- **Command center:** `/admin/notification-health` — reachability funnel, health
  buckets, 7/14/28-day survival, today's delivery→receipt→click, same-day deaths.
- **Alert (build target):** if today's accepted-push count or receipt % drops
  below a floor, flag it — don't wait for a student or the founder to notice.
- **Incident playbook — "no pushes arriving":** (1) check the cron fired
  (rows created at the slot minute); (2) check `pushed_at` is being stamped
  (send path healthy); (3) check `received_at` (device vs service problem);
  (4) check VAPID config in `server_config`; (5) check the health funnel for a
  mass `disconnected` jump (permission/endpoint event).

---

## 8. Testing & validation (evidence, not assumptions)

- **Production truth:** validate with real DB reads, not "should work." A push is
  proven delivered only by a `received_at` beacon.
- **End-to-end device test:** targeted single-student push, app **force-stopped**,
  confirm the notification renders and the beacon stamps `received_at`, then the
  deep link opens the right screen.
- **Matrix (as volume allows):** Android Chrome installed (WebAPK), Android Chrome
  browser, iOS installed PWA (16.4+), iOS Safari (expect: no web push).
- **Regression guardrails:** the 10/day cap holds; no path unsubscribes a healthy
  sub; every new `type` is in `STUDENT_BUDGET_TYPES`; every send has a reason.

---

## 9. Founder Acceptance Checklist (a change is not done until all pass)

- [ ] Obeys every §2 non-negotiable in the Constitution.
- [ ] Push works with the app fully closed (verified by a `received_at` beacon).
- [ ] Every send carries `reason` + `expected_action`.
- [ ] New `type` counts against the budget; 10/day cap intact.
- [ ] No new pre-install or browser permission ask; no second in-app ask.
- [ ] No code path unsubscribes a healthy subscription.
- [ ] Command center reflects the change; no metric silently regressed.
- [ ] Typecheck + lint + build clean; deployed to main; deploy `READY`.
- [ ] Verified in production with real numbers, cited back to the founder.
