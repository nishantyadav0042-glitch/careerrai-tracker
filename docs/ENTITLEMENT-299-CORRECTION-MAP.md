# ₹299 Entitlement Correction — Recon, Matrix, Dependency Map
**24 Aug 2026 · read-only · no implementation**

---

## 1. Headline: the boundary is already correct — the *grant* is missing

The suspicion was that ₹299 leaks continuous chat. At the **payment layer it
does not.** `activate-payment.ts` sends the session down a deliberately
different road:

```
if (row.plan === SESSION_PLAN_ID) return activateSessionCredit(...)   // ← no premium, no buddy
...
await grantPremiumAndQueueBuddy(...)                                   // ← subscriptions only
```

A ₹299 buyer gets **no `is_premium`, no `profiles.buddy_id`**. That part of the
commercial architecture was built correctly and needs no change.

**The real defects are different, and one of them is the opposite problem:**

| # | Defect | Severity |
|---|---|---|
| **A** | ₹299 grants **ZERO** messages, not 3 — nothing creates a `mentor_grant` on purchase | product gap |
| **B** | The 3-cap sits inside `if (!pair)`. Any student with `profiles.buddy_id` **bypasses it entirely** → unlimited | **security/commercial leak** |
| **C** | The counter is `count()` → compare → insert. Classic TOCTOU; concurrent sends can exceed 3 | **FLOW 8 fails today** |

Production already shows the shape of B: **1 student has `buddy_id` but is not
premium.**

---

## 2. The existing authority — REUSE, do not fork

A three-message entitlement **already exists**:

| Thing | Where | Value |
|---|---|---|
| The constant | `lib/mentor-doors.ts` | `MENTOR_FREE_MESSAGES = 3` |
| The counter | `resolveGrantAccess()` | counts `chat_messages` where `sender_id = student` |
| The gate | `/api/chat/send` | returns `free_messages_used` + upgrade CTA |
| The entitlement row | `mentor_grants` (31 rows) | created by `/api/admin/mentor-doors` |

**Do not build a new counter, a new constant, or a `session_message_credits`
table.** The correction is to make a ₹299 purchase *issue this existing
entitlement*, and to close the bypass.

### The bypass, precisely

```js
let pair = await resolvePair(admin, user.id, studentId);  // gates ONLY on profiles.buddy_id
if (!pair) {
  const grantAccess = await resolveGrantAccess(...);      // ← the 3-cap lives ONLY here
  if (grantAccess.remaining <= 0) return upgradeCTA;
}
```

`resolvePair` performs **no plan, premium or entitlement check whatsoever**. It
asks one question: does this student have a `buddy_id`? If yes → unlimited.

So the moment a ₹299 student is connected to a mentor via `profiles.buddy_id`
— which is the natural way to deliver their session — they silently receive
the ₹999/₹2,499/₹2,999 chat entitlement. **This is the leak to close.**

---

## 3. Entitlement matrix (read from the repo, not guessed)

Plan authority is `lib/plans.ts`; the session price is
`lib/session-credit.ts :: SESSION_PRICE_PAISE = 29900`.

| | **₹299** session | **₹999** `monthly` | **₹2,499** `quarterly` | **₹2,999** `tillcat` |
|---|---|---|---|---|
| Plan id | `SESSION_PLAN_ID` | `monthly` | `quarterly` | `tillcat` |
| Duration | one-off | 1 month | 3 months | 4 months |
| 1:1 session | **YES — 1** | via plan | via plan | via plan |
| 3 free messages | **must become YES** (today: 0) | n/a (unlimited) | n/a | n/a |
| Continuous chat | **NO** | YES | YES | YES |
| `is_premium` | **NO** (correct today) | YES | YES | YES |
| `profiles.buddy_id` | **NO** (correct today) | queued | queued | queued |
| Session credit row | YES | no | no | no |

**Ambiguity to confirm (§10 stop rule):** the written brief says "₹999 and
₹2,499"; the spoken note said "triple nine and two-triple-nine" (₹999 and
₹2,999). The repo has **three** subscription plans — ₹999, ₹2,499, ₹2,999.
I have assumed **all three** are the continuous-chat tier, since the rule is
"₹299 is narrow, subscriptions are continuous". Flagging rather than silently
deciding.

---

## 4. Google Calendar — verified, and the belief is not supported

Checked the **token store**, not the flag:

```
google_oauth_tokens ............ 0 rows
buddies with google_calendar_connected = true ... 0 of 8
Shreya Bendigeri (buddy) ....... buddy_meet_url YES · OAuth token NO · room event NO
```

Shreya has a **hand-pasted Meet URL**, not a Google connection. `ensureBuddyRoom()`
requires a live OAuth token, so it fails for her and for every mentor. No
calendar events are created and no invites are sent.

**Do not build around an integration that is live — it is not live.** The code
is complete; nobody has completed the OAuth consent.

---

## 5. KEEP / REUSE / MODIFY / BUILD / DO NOT BUILD

| Component | Current authority | Decision | Why |
|---|---|---|---|
| `MENTOR_FREE_MESSAGES` | `lib/mentor-doors` | **REUSE** | The 3-message rule already exists |
| `resolveGrantAccess` | `lib/mentor-doors` | **MODIFY** | Make the counter atomic; recognise a session-issued grant |
| `resolvePair` | `lib/chat` | **MODIFY** | Must stop being an unlimited-chat pass; needs an entitlement check |
| `/api/chat/send` | route | **MODIFY** | Cap must apply on **both** paths, not only `!pair` |
| `mentor_grants` | table | **REUSE** | The entitlement row; issue one on ₹299 |
| `activateSessionCredit` | `lib/activate-payment` | **MODIFY** | Issue the 3-message grant at purchase |
| `session_credits` | table | **KEEP** | Entitlement authority; already correct |
| `PLANS` | `lib/plans` | **KEEP** | Single plan authority; do not duplicate |
| `SESSION_PRICE_PAISE` | `lib/session-credit` | **KEEP** | Single price authority |
| `video_sessions` + triggers | DB | **KEEP** | Session lifecycle authority |
| `buddy_availability` | DB | **KEEP** | New; slots depend on it |
| `finding_kind` / `FINDING_TO_SPECIALITY` | `lib/session-credit` | **EXTEND** | Booking-reason taxonomy — do not fork |
| Google Meet/Calendar | `lib/google-meet` | **KEEP** | Complete; blocked on OAuth consent only |
| WhatsApp | `lib/whatsapp` (`wa.me`) | **REUSE** | Deep links only; **no Business API** |
| Reschedule routes | `calendar/reschedule-meeting` | **DO NOT EXPOSE** | Founder: no self-service reschedule |
| Refunds | — | **DO NOT BUILD** | Founder: manual only |
| Student session feedback | — | **BUILD** | Does not exist |
| `buddy_feedback` | table | **DO NOT REUSE** for this | It is mentor→student |
| `rating_prompts` | table | **DO NOT TOUCH** | App Store prompt |
| `coaching_sessions` | table | **DO NOT TOUCH** | Coaching-class timetable |
| `session_assignments` | table | **DO NOT TOUCH** | Post-call tasks |
| 2B-2 auto-assignment | — | **PAUSED** | Unchanged |

---

## 6. The correction, in one picture

```
₹299 paid
   ↓
activateSessionCredit
   ├─ session_credits row (exists today)
   └─ ISSUE a 3-message entitlement        ← BUILD (defect A)
   ↓
student messages buddy
   ↓
/api/chat/send
   ├─ resolvePair  →  entitlement check     ← MODIFY (defect B: today this is an unlimited bypass)
   └─ atomic decrement, not count-then-insert  ← MODIFY (defect C)
   ↓
4th message → blocked → upgrade CTA to PLANS
```

The cap must move **out of the `!pair` branch** and become a property of the
student's entitlement, evaluated on every send regardless of how they are
paired.

---

## 7. Parallel tracks

| Track | Depends on | Start now? |
|---|---|---|
| **A** entitlement: issue grant on ₹299 + close the `resolvePair` bypass + atomic counter | none | **YES** |
| **B** booking intake extending `finding_kind` | none | **YES** |
| **D** student session feedback + structured closeout | none | **YES** |
| **E** abuse tests (concurrency, tabs, direct API, logout/login) | A | after A |
| **C** slot picker / booking reliability | availability + OAuth consent | **blocked on ops** |

---

## 8. Decisions needed before implementation

1. **Do all three subscription plans (₹999 / ₹2,499 / ₹2,999) get continuous chat?**
   Assumed yes; confirm.
2. **Are the 3 messages per purchase, or per student lifetime?** A student who
   buys two ₹299 sessions — 3 more messages, or still 3 total?
3. **Do the 3 messages expire?** With the session, after N days, or never?
4. **The 1 existing student with `buddy_id` but no premium** — grandfather them
   into unlimited, or move them to the 3-message cap?
5. **A ₹299 student's mentor link:** should the session assign `profiles.buddy_id`
   (which today means unlimited) or stay on `session_credits.buddy_id`? This
   determines whether the fix is a gate or a data-model change.
