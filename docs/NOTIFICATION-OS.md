# CareerRai Notification OS — Constitution

> **Status:** binding architecture document. Changes rarely (think Linux kernel
> principles). Every notification feature — push, in-app, WhatsApp, email — must
> obey this. Any AI agent (Claude, Fable, Codex, Cursor) reads this **before**
> writing a line of notification code. If a change violates this document, the
> change is wrong, not the document — escalate to the founder instead of
> shipping the violation.
>
> This is the **Constitution** (what the OS is). The **Execution Manual** (how to
> build and validate against it) lives in `docs/NOTIFICATION-OS-EXECUTION.md`.

---

## 0. The one KPI

A student who has enabled notifications keeps receiving **reliable, relevant**
notifications every single day **until they intentionally turn them off or
uninstall.**

Not delivery receipts. Not open rate. Reach that survives *weeks* after install,
and that causes *studying*. Every decision below optimizes this and nothing else.
When two goals conflict, long-term reliability wins over permission rate, over
install speed, over cleverness.

---

## 1. Founder philosophy — why notifications exist

- A notification exists to bring a student back **when they are not in the app.**
  If the student is already inside CareerRai, the notification has already done
  its job or already failed — it is not the mechanism.
- Notifications are **infrastructure, not a feature.** Treat them like a payments
  system: zero silent failures, everything observable, everything measurable,
  everything that can self-heal does.
- Notifications create **habits, not engagement.** The win is a study logged, not
  a tap. A push that gets tapped but changes no behaviour is a vanity success.

---

## 2. Non-negotiables (the hard lines)

1. **Never trust a subscription.** "A row exists" ≠ "reachable." Healthy =
   permission granted AND live subscription AND delivery verified recently.
2. **Never trust a permission.** The OS can revoke it silently; verify on every
   app open and repair what you can.
3. **Always verify.** Prove delivery on the device (receipt beacon), not at the
   push service ("accepted" is not "delivered").
4. **Always self-heal.** Repair silently on app open. Only show recovery UI when
   silent repair is impossible (an OS-revoked permission needs a visible tap —
   platform law, the sole exception).
5. **Zero silent failures.** Every stage is timestamped; a failure that no
   dashboard can see is a bug in this OS, not an accident.
6. **Decision-first, never cron-first.** A cron is a *clock*, not a reason. A
   notification is sent because the decision engine approved it, never because a
   job fired.
7. **One student, one state.** A student is in exactly one state at a time; the
   state owns which notifications may speak. Two senders can never fight over one
   student on one day.
8. **Attention is finite.** Every notification competes; only the highest-value
   one survives per slot. The hard ceiling is 10/day; the *preferred* load is
   4–6, and for recovering/dormant students far fewer.
9. **Subscriptions are born in their permanent home.** Never mint a push
   subscription anywhere but the installed app (see §7). Evidence: browser-born
   subscriptions survived ~25% in production; installed-app-born ~92%.
10. **Reuse, don't rotate.** Never `unsubscribe()` a healthy subscription to mint
    a new one. Rotation strands dead endpoints. Rotate only on a confirmed
    410/404 or a genuine VAPID-key change, and always persist with retry.

---

## 3. Student state machine

Exactly one state per student (`src/lib/notification-os.ts :: computeStudentState`):

| State | Definition | Who may speak |
|---|---|---|
| `building_plan` | onboarding incomplete | builder-recovery only |
| `plan_ready` | plan built, never logged | activation ladder |
| `onboarding_arc` | logged 1–6 days, joined <14d | day 1–7 habit arc |
| `active` | logged today/yesterday, graduated | decision events |
| `slipping` | 2–6 days quiet | recovery ladder |
| `inactive` | 7–13 days quiet | recovery ladder |
| `dark` | 14+ days quiet | one win-back, then humans |

Conversion (premium / has-buddy) is an **attribute, not a state** — a paying
student still has a routine; they simply never get sales-adjacent copy.

---

## 4. Decision engine

Every student-facing nudge passes through **one gate** (`dispatch()`), which
answers, per send:

- **Who** — this student, in this state.
- **Which** — the single highest-value message; everything else is suppressed.
- **Why** — a `reason` code recorded on the row. If the engine can't state
  why-this-student / why-now / why-this-message, it does not send.
- **When** — the state's slot; behaviour beats the clock.
- **Worth it?** — is this within budget, and will it plausibly cause a study.

No auto-silence by ignore-count alone: for dormant/never-active students,
ignored ≠ stop-trying. The budget is the volume control.

---

## 5. Budget & heartbeat

- **Hard ceiling: 10 pushes / IST-day**, enforced at the lowest send level
  (`sendPushToUser`) so broadcasts and transactional sends count too.
- **State budgets** are the real cadence: 4 (active), 8 (setup/recovery).
- **Heartbeat = one *meaningful* touch/day, not one push.** Suppress a student
  who already studied today, or was already reached, or (future) was reminded on
  another channel. Behaviour-driven, never volume-driven.

---

## 6. Reliability & health model

Every subscription carries a health state
(`src/lib/notification-health.ts :: scoreStudent`):

| State | Meaning | Action |
|---|---|---|
| `healthy` | live sub + device receipt ≤3d | none |
| `unverified` | live sub, no device receipt yet | let the beacon confirm |
| `stale` | live sub, last receipt ≥7d despite sends | investigate |
| `disconnected` | wants push, no live sub | reconnect flow |
| `never_opted_in` | no push preference | install/opt-in funnel |
| `opted_out` | push explicitly off | respect it |

Repair **before** dead whenever possible. On every app open the reliability layer
verifies permission → subscription → key match → service worker → backend sync
and heals silently.

---

## 7. Permission architecture

**When:** only inside the installed app. **Never** before install, never in a
browser tab. **Where:** immediately after the first Career Insight, framed by the
value just shown ("switch on daily insights & reminders"). **Why in-app:** the
subscription is born in its permanent home and never has to survive the
browser→WebAPK transition — the proven cause of same-day death.

Flow: onboarding → install → first insight → enable → OS permission → subscribe
(standalone) → verify backend → **welcome push → device receipt → mark healthy.**

**Recovery:** a `disconnected` student (prefs on, sub dead) sees a reconnect
screen on next open. **Migration:** existing browser/null subs are re-stamped to
standalone context on next open; dead ones recover via reconnect.

**Accepted trade:** fewer raw grants (browser-only users aren't asked). Correct —
a browser-only user was never reliably reachable. We never optimize the
permission-rate vanity number.

---

## 8. Delivery philosophy — every stage measured

```
created → queued → sent → accepted → received → displayed → tapped → opened → study started → studied → returned
```

Timestamps on the `notifications` row: `created_at` → `pushed_at` (accepted) →
`received_at` (device receipt + display, app closed) → `clicked_at` (tapped).
The tail — study started / studied / returned — is the **retention metric that
matters more than delivery**, joined from `daily_reports`. "Accepted by the push
service" is never reported as "delivered."

---

## 9. Channel selection (target architecture)

Push · In-app · WhatsApp · Email · **Nothing.** The decision engine picks the
channel; "nothing" is a first-class, often-correct choice. In-app notifications
are generated independently by the engine (not fetched-on-open) and are the
durable record; push is the reach mechanism; WhatsApp/email are recovery paths
for students push can't reach.

---

## 10. Personalization (target architecture)

Each student trends toward a profile: preferred time, preferred message, preferred
frequency, preferred tone, best channel, a fatigue score, a motivation profile.
Rules detect; a model may *phrase* — never invent facts, never fabricate stats,
never a testimonial that didn't happen.

---

## 11. Success & failure

- **Success is not delivery.** Success is *a student who studied because of a
  notification.* Measure notification → open → study-started → returned.
- **Failure is silent failure.** Any break the team learns about from a student
  or the founder, rather than from the system, is unacceptable.

---

## 12. Reliability targets

| Target | Goal |
|---|---|
| Push acceptance | ≥99% |
| Verified device receipt | ≥98% |
| Healthy subscriptions | ≥95% |
| Same-day subscription deaths | <1% |
| 28-day survival | ≥95% |
| Silent failures | 0 |
| Manual recovery required | ~0 |

Every target has monitoring on `/admin/notification-health`.

---

## 13. Scalability & platform truth

- The architecture is identical at 100 and 1,000,000 students: decision-first,
  one-state-per-student, verify-and-heal, everything measured. Volume changes
  thresholds and dashboards, never the shape.
- **Hard platform limit:** Web Push requires `userVisibleOnly:true` — you cannot
  send a silent/hidden push. Hourly synthetic health-pings are therefore
  impossible; reliability is measured on the **real** daily sends via the receipt
  beacon. Any design that assumes silent background pushes is invalid on this
  stack.

---

## 14. Engineering standards (no exceptions)

- One shared client helper mints/persists subscriptions
  (`src/lib/push-client.ts`) — no path re-implements subscribe/unsubscribe.
- Every send carries `reason` + `expected_action`. No anonymous sends.
- VAPID keys are a single DB-authoritative pair (public signs what private
  verifies) — never split across env/DB.
- New notification types register in `STUDENT_BUDGET_TYPES` so they count against
  the budget.
- Idempotent broadcasts (per-channel markers); never double-send.
- No invented statistics, no fabricated testimonials, ever.
