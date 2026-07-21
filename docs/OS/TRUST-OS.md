# CareerRai Trust OS — Constitution

> **Status:** binding architecture document. Changes rarely (think Linux kernel
> principles). Every surface where a student decides whether to believe us —
> mentor matching, payments, refunds, testimonials, video sessions, the buddy
> chat — must obey this. Any AI agent (Claude, Fable, Codex, Cursor) reads this
> **before** writing a line of mentor, payment, testimonial, or safety code. If
> a change violates this document, the change is wrong, not the document —
> escalate to the founder instead of shipping the violation.
>
> Trust is the only asset a small brand cannot re-buy. A payments bug is
> recoverable; a fabricated testimonial or a dead mentor match is not.

---

## 0. The one KPI

Every student who pays us, or whom we match to a buddy, gets a **real,
responsive mentor and an honestly-described product** — no exception, no
silent gap between what we promised and what they got.

Not conversion rate. Not testimonial count. Not GMV. The north star is the
distance between **what we claimed** and **what the student actually received**,
driven to zero. When two goals conflict, a kept promise beats a closed sale,
beats a louder landing page, beats a cleverer growth loop. A paid student with
no responsive buddy is a total failure of this OS even if the payment succeeded
flawlessly.

---

## 1. Founder philosophy — why Trust is the product

- **Trust is the product; the app is the delivery mechanism.** A CAT aspirant is
  handing us a year of their life and their parents' money. Every screen either
  earns that or spends it.
- **A mentor match is a promise, not a feature flip.** The moment we say "your
  IIM senior is being assigned," a human being is now owed to this student. If we
  can't honor it, we don't make it.
- **Positioning is dignity, never charity.** A free student who earns mentor
  access is told *"your preparation history is now rich enough for real advice"* —
  never *"here's a free reward."* We sell the problem the buddy solves against
  something true about the student's own prep, never a boast about the buddy
  (`src/lib/buddy-banner.ts`).
- **Proof over persuasion.** Real receipts beat written claims. One unprompted
  WhatsApp message a student actually sent outsells any headline we could write —
  so we render the real thing and hide only the phone number.

---

## 2. Non-negotiables (the hard lines)

1. **No invented testimonials or stats. Ever.** Every quote in
   `src/lib/testimonials.ts` was actually said by a real student, kept verbatim,
   with a screenshot/message as the consent record. Numbers stay hidden; names
   need a 👍. `Testimonials` renders **nothing** rather than a fake or an empty
   shell (`src/components/testimonials.tsx`). This is the same rule the AI layer
   obeys (`GOVERNING_RULE`, `src/lib/gemini.ts`): summarize and phrase, never
   fabricate.
2. **Never hand out a link you can't verify.** If Daily.co can't mint a room, the
   session is **refused loudly** (503), never scheduled around a dead link that
   only fails at meeting time (`src/lib/daily.ts`, `/api/calendar/schedule-meeting`,
   `/api/admin/video-health`). A promise a student discovers is broken at the
   moment of the meeting is the worst kind.
3. **Payments are idempotent, server-verified, and never client-trusted.**
   Subscription state changes **only** from a signature-verified Razorpay webhook
   (`verifyRazorpayWebhook`, constant-time HMAC). Client "payment success"
   callbacks change nothing. Razorpay's double delivery and retries must be
   no-ops (`grantPremiumAndQueueBuddy` atomic gate; `activate_payment` status
   guard).
4. **A mentor match, once made, is honored.** One grant per student ever, one
   buddy, and the 48-hour escalation exists so "your buddy responds within 24h"
   is a real SLA, not a slogan (`/api/cron/buddy-escalation`).
5. **The repo is public — no secrets, ever.** Razorpay/ Daily/ Gemini keys live
   in env or `server_config`, read server-side only. The Razorpay secret must
   never reach the client; only `RAZORPAY_KEY_ID` (public) is returned to the
   browser.
6. **Money-back guarantee is honored, refunds are deliberate.** A refund request
   flags a human (`/api/payments/request-refund`); the actual refund is processed
   by hand in the Razorpay dashboard, never auto-fired. The account and all logs
   survive a downgrade.
7. **Downgrade never deletes.** Refund, expiry, or pause preserves streak, mocks,
   debriefs, and buddy history. We pause a journey; we never erase one.

---

## 3. The Mentor Doors model — earned, dignified, capped

Two ways a **free** student earns **3 messages with ONE matched IIM buddy**
(`src/lib/mentor-doors.ts`). The doors encode *proof of seriousness*, not an
arbitrary streak:

| Door | Threshold | Meaning |
|---|---|---|
| `history` | 5 logged days, OR 3 logged days + 1 mock debrief | Prep history rich enough for real advice. A 6-day deep-work student with a mock qualifies; a 7-day all-rest-day student does not. |
| `intent` | Reached for the locked buddy **twice, ≥1 hour apart** | Coming back to the same locked door is raising a hand, not browsing (`/api/engagement`, `student_engagement.intent_door_at`). |

Hard rules either way: **one grant per student, ever** (`mentor_grants`,
`onConflict: student_id`); **one buddy only** (least-loaded real buddy —
deterministic, protects paid capacity); **3 student messages total**, then the
upgrade ask (`/api/chat/send` → `free_messages_used`). Premium, test, demo, and
already-buddied students are excluded — the doors are for free students only.
The **buddy opens** the conversation with a Gemini-drafted opener built from the
student's real week (facts from our queries, Gemini only phrases; rule-built
fallback when Gemini is down) — so the first message already proves someone
looked.

**Status: Live-but-dormant.** Doors are *detected and recorded* the moment they
cross (so the founder can watch who is waiting), but grant access is gated behind
`MENTOR_DOORS_ENABLED=true` AND an admin activation (`/api/admin/mentor-doors`).
`grantIsActive` requires all three: flag on, activated, buddy matched. Activation
is safe to run in advance — it stays invisible to students until the flag flips.

---

## 4. Payments & subscription lifecycle (Live)

Razorpay via raw HTTP + Node crypto — no npm dependency, secret server-only
(`src/lib/razorpay.ts`). Memberships are **one-time purchases, not auto-debit**.

| Stage | Where | Truth enforced |
|---|---|---|
| Intent | `/api/payments/create-order` | Price resolved **server-side** (scholarship beats coupon); status `created`. Pending-order reuse now matches on **amount** too — a stale order can never charge a price the UI didn't promise (audit, 14 Jul). |
| Free path | same route | Grant below Razorpay's floor → activate directly; coupon burned via `coupon_redemptions` unique constraint + conditional `increment_coupon_use` (TOCTOU-safe). |
| Activation | `/api/payments/webhook` | **Signature-verified only.** One atomic `activate_payment` RPC marks paid + activates + burns coupon; 500 → Razorpay retries; status guard makes retries safe. |
| Freemium unlock | `grantPremiumAndQueueBuddy` | Atomic is_premium flip (only if `is_premium=false`), queues **one** buddy, drops sales queue, one "Buddy unlocked" notification. Idempotent under double delivery. |
| Renewal dunning | `/api/cron/renewal-reminders` | Kind reminders at 7/3/1 days, deduped per threshold. Never a surprise lapse. |
| Expiry | `/api/cron/expire-subscriptions` | Term ends → `active`→`paused`, **data fully preserved**, plan buttons re-show. Continuity, not a hard stop. |
| Refund | `/api/payments/request-refund` → webhook `refund.processed` | Human-flagged, hand-processed; `revokePremium` downgrades and cancels the pending buddy, keeps the account. |

Server-side Meta CAPI Purchase is deduped with the browser Pixel via
`eventId = orderId` — even analytics never double-counts.

---

## 5. Buddy matching & the SLA that makes the match real

- **Match is explainable, never a black box** (`src/lib/buddy-match.ts`). A buddy
  ranks up when their strongest section is the student's weakest, or when their
  *own* repeater comeback (`first_attempt_percentile → cat_percentile`) mirrors
  the student — real lived journey outranks a self-checked "types helped" box.
  Copy never contradicts the buddy's actual history (a repeater buddy is never
  sold as a "first-timer success story").
- **Test/demo buddies are never shown to real students** (`is_test_account`
  guard in `getRecommendedBuddiesForStudent`).
- **The briefing arrives before the buddy needs it** (`src/lib/buddy-briefing.ts`,
  `buddy_briefings`). Facts-only, name-stripped, auto-refreshed on real events —
  a busy part-time mentor never has to remember to click. It states verifiable
  numbers and poses patterns as open questions; it never diagnoses.
- **The 24h promise is measured, not asserted.** `computeBuddySLA`
  (`src/lib/buddy-sla.ts`) tracks response hours, percentile delta, and session
  show-up rate per buddy; `/api/cron/buddy-escalation` pings admin when a student
  message or mock debrief sits unanswered for 48h.

---

## 6. Video sessions — the "no dead links" law (Live)

Daily.co is the **one** provider (`src/lib/daily.ts`), reached the hard way:
Google Meet (killed by per-buddy OAuth + Google's verification wall) and public
Jitsi (killed when it began forcing the first joiner to log in as moderator)
both failed the core test — *a link a student can join with just a name.* Daily
rooms are `public`, name-only, auto-expiring, minted from one server-side key.

The law, learned in the 21 July incident (rooms created fine but *joining* was
blocked by a missing payment method): **never hand out a link we can't verify.**
If room creation fails, `/api/calendar/schedule-meeting` refuses loudly rather
than scheduling around a link that dies at meeting time. `/api/admin/video-health`
mints a real 30-minute test room from production so an admin can confirm the full
join path from a phone — green + joinable = healthy.

> **Debt:** `src/lib/daily.ts`'s doc comment still mentions a "Jitsi fallback"
> that no longer exists — the code correctly returns `null` and callers refuse.
> The comment is stale; the behavior is right. Fix the comment, never
> reintroduce the fallback.

---

## 7. Testimonials & social proof — real receipts only (Live)

| Rule | Enforcement |
|---|---|
| Every quote is verbatim, really said | `TESTIMONIALS` in `src/lib/testimonials.ts`, each with a dated provenance comment |
| Consent is on file | A screenshot / message is the record; a 👍 before a full name + college |
| Numbers hidden | Phone numbers never rendered — `WhatsAppLiveChat` transcribes the real chat so the number stays hidden *by construction* |
| Never invent, never edit a student's words | Enforced by convention + code review; the AI layer's `GOVERNING_RULE` forbids fabrication end to end |
| Empty is fine, fake is not | `Testimonials` returns `null` with zero real quotes — never a placeholder |

Real proof is rendered **loudly** (founder: "testimonials are our trust
speaking — make them bold"): big quote cards + the actual unprompted screenshot.
Loud is allowed; invented is not.

---

## 8. Moderation & safety (Partial / Planned)

- **Live:** the mentor chat runs only between a matched student–buddy pair
  (`resolvePair` / `resolveGrantAccess`); a grant buddy can only reach their one
  matched student. The AI never speaks to the student directly — it works
  backstage for the human mentor (`GOVERNING_RULE`). Security-relevant payment
  events are audit-logged (`logSecurityEvent`).
- **Planned:** in-product report/block for chat abuse, buddy conduct review, and
  content moderation on student-authored text are **not yet built**. Escalation
  today is a single 48h-unanswered ping to admin, not a safety pipeline. Mark any
  safety claim beyond this as Planned — do not imply moderation that does not
  exist.

---

## 9. Key components map (concern → real surface)

| Concern | File / table |
|---|---|
| Mentor doors, grant, 3-msg cap | `src/lib/mentor-doors.ts`, `mentor_grants`, `chat_messages` |
| Door detection (history / intent) | `checkHistoryDoorAfterLog`, `/api/engagement` → `student_engagement.intent_door_at` |
| Grant activation (admin) | `/api/admin/mentor-doors`, `activateGrant` |
| Chat cap enforcement | `/api/chat/send` (`free_messages_used`) |
| Buddy matching | `src/lib/buddy-match.ts` |
| Buddy briefing (facts-only) | `src/lib/buddy-briefing.ts`, `buddy_briefings` |
| Buddy banners (sell the problem) | `src/lib/buddy-banner.ts` |
| Buddy SLA + escalation | `src/lib/buddy-sla.ts`, `/api/cron/buddy-escalation` |
| Razorpay client + webhook verify | `src/lib/razorpay.ts` |
| Order / activation / freemium | `/api/payments/create-order`, `/api/payments/webhook`, `src/lib/premium.ts` |
| Refund / expiry / renewals | `/api/payments/request-refund`, `/api/cron/expire-subscriptions`, `/api/cron/renewal-reminders` |
| Subscription state | `profiles.subscription_status / subscription_renews_at / is_premium / premium_since`, `student_payments` |
| Video rooms + health | `src/lib/daily.ts`, `/api/calendar/schedule-meeting`, `/api/admin/video-health` |
| Testimonials (real only) | `src/lib/testimonials.ts`, `src/components/testimonials.tsx` |
| AI honesty backbone | `GOVERNING_RULE` in `src/lib/gemini.ts` |

---

## 10. Success & failure

- **Success is not a closed sale.** Success is a paid or matched student who got
  the responsive mentor and the honest product we described. A flawless payment
  with no live buddy behind it is a failure of this OS.
- **Failure is any gap between claim and delivery** — a dead video link, a
  testimonial no one said, a buddy who never replied, a discount the UI promised
  but the charge ignored. Every one of these is a trust debit that no growth
  number can offset.

---

## 11. Scalability & platform truth

- The shape holds at 100 and 1,000,000 students: server-verified payments,
  idempotent side-effects, one-grant-per-student, deterministic matching,
  verify-before-you-hand-out, real-receipts-only. Volume changes buddy capacity
  and dashboards, never these invariants.
- **Hard platform limits worth stating:** Razorpay is the payment rail and its
  webhook is the only source of subscription truth — no client path may bypass
  it. Daily.co's free tier (10k participant-minutes/mo) and card-on-file
  requirement are real constraints; the video-health check exists because
  "created" ≠ "joinable" on this stack. Memberships are one-time by design — any
  feature that assumes auto-debit is invalid here.

---

## 12. Engineering standards (no exceptions)

- Subscription state mutates **only** through the signature-verified webhook or
  the server-verified free path — never from the client, never from an unguarded
  route.
- Every premium side-effect is idempotent (atomic conditional updates, status
  guards, unique constraints) — retries and double-deliveries are no-ops.
- Prices are resolved and enforced server-side; the client is told the label, not
  trusted for the amount.
- Any handed-out artifact (video link, buddy match, opener) is verified before it
  reaches a student, or refused loudly.
- Secrets stay server-side; the public repo carries none. Only public key IDs
  cross to the browser.
- No invented statistics, no fabricated testimonials, no AI-authored diagnosis —
  ever. The model phrases facts; it never invents them.
