# CareerRai — The Mission

> **Status: binding, and it outranks every other document in this repo.**
> The Constitutions in `docs/OS/` say how each domain must behave. This file
> says what the company is for. When a Constitution and this file appear to
> conflict, escalate to the founder — do not resolve it yourself.
>
> Founder, 12 Aug 2026. Recorded verbatim because a mission paraphrased is a
> mission diluted.

---

## The mission

> **How do we build a free, massively used student platform that continuously
> learns how Indian students actually study, struggle, decide, improve,
> interact, and eventually achieve outcomes — and use small amounts of
> monetisation only to keep that machine running?**

Read it twice, because the ordering inside it is the whole strategy:

1. **Free** comes first. Not freemium-as-a-trap. Free is the product.
2. **Massively used** comes second. Reach without depth is a vanity metric.
3. **Continuously learns** is the actual asset. The platform gets smarter with
   every student-day, or it is just an app.
4. **Achieve outcomes** is the ground truth. Behaviour without a result
   attached teaches nothing.
5. **Small amounts of monetisation, only to keep the machine running** — money
   is fuel, never the destination. We are not optimising ARPU.

The comparison set is Duolingo and Reddit, not Topmate or Unacademy. Those
companies are worth what they are worth because of the *corpus* they
accumulated, not the price they charged.

---

## The filter every new feature must pass

From 12 Aug 2026, any proposed feature — by the founder, by an engineer, by an
AI agent — answers these four questions **before** it is designed:

1. **Does it make the free product better for a student who will never pay?**
   If the honest answer is no, it is a monetisation feature and must be
   labelled as one. That is allowed, but rarely, and never at the expense of #2.

2. **Does it deepen what we learn about how this student studies?**
   Every meaningful interaction should leave a structured trace:
   behaviour → problem → diagnosis → intervention → outcome. A feature whose
   output disappears into a WhatsApp thread, a Meet call, or an unlogged screen
   has taught us nothing and is a missed deposit into the only compounding
   asset we have.

3. **Does it survive being used by 100,000 students?**
   Not "does it scale technically" — `docs/SCALE-CONTRACT.md` governs that.
   Does the *behaviour* still make sense? A feature that needs a founder to
   manually watch it is a service, not a platform.

4. **Would we still build it if it earned ₹0?**
   If yes, it is probably mission-aligned. If it only exists to convert, it
   belongs in the paid surface and must not be allowed to leak into the free
   one.

**A feature that fails #1 and #2 does not ship, however much revenue it
promises.**

---

## The honest gap (measured 12 Aug 2026 — re-run before trusting)

The mission is the destination. This is where we actually stand, so nobody
builds the roof before the foundation.

Of **319 students who signed up in the last 45 days**:

| Milestone | Students | % |
|---|---|---|
| Signed up | 319 | 100% |
| Logged a study day at least once | 59 | 18% |
| Logged on 2+ separate days | 28 | 8.8% |
| Logged on 7+ separate days | 5 | **1.6%** |
| Still logging in the last 3 days | 19 | 6% |

Query: `daily_reports` joined to `profiles` by `student_id`, cohorted on
`profiles.created_at`.

**What this means, stated plainly:** we are acquiring students efficiently and
losing 82% of them before they perform the single action the entire learning
machine is built on. A platform that "continuously learns how Indian students
study" currently learns deeply about **five people**.

This is not a reason to abandon the mission. It is the mission's own first
instruction: **the highest-leverage work available to this company right now is
first-week retention, not new services, new price points, or new surfaces.**
Every engagement or monetisation idea gets ranked against "does this move
319 → 59 → 28 → 5?" first.

Duolingo's real lesson is not the streak or the owl. It is that they spent
years treating D1/D7 retention as the only metric that mattered, and monetised
almost nothing until the habit was real.

---

## The four surfaces (founder, 12 Aug)

CareerRai has exactly four student-facing surfaces. Anything that does not fit
one of them is asking to become a fifth, and needs an explicit founder
decision.

| # | Surface | Job | Today |
|---|---|---|---|
| 1 | **Study plan** (free) | "What do I do today?" — the habit, the core loop, the data source | `/student/today`, `/student/plan` |
| 2 | **Buddy** (paid) | Human relationship: someone who watches whether you actually change | `/student/buddy` |
| 3 | **Daily Pick** (engagement) | A reason to open the app on a day you didn't study | `/student/community` |
| 4 | **Depth** | Everything in-depth: analysis, reports, journey, blueprint, exams | `/student/analysis`, `/student/reports`, etc. |

Surface 1 is the mission. Surface 3 exists to protect Surface 1 (an app you
stop opening cannot teach you anything). Surface 2 is the fuel. Surface 4 is
the payoff for depth of history — and is therefore the surface that gets
*better* the longer a student stays, which is exactly the compounding the
mission asks for.

---

## Standing product decisions (12 Aug 2026)

Recorded here because they are mission-level, not feature-level.

**Mentor supply is reviewed, never self-serve.** Anyone may build a profile and
press submit. The profile does **not** go live on submit. It enters review, we
run a background check, and only then is it published — and the applicant is
told this at the end of the form, not hidden from them. This is the line
between CareerRai and an open marketplace, and `docs/OS/TRUST-OS.md` §0 is why:
a mentor match is a promise, so we must know who we are promising.

**Every session ends with a one-minute buddy feedback on the student.** Not a
rating of the session — a structured read of the *student*: what the problem
actually was, what was recommended, what to watch next. This is the single
highest-value data our human layer can produce, and today it is being lost.
`buddy_feedback` already has a `diagnosis_issue` / `diagnosis_section` /
`diagnosis_confidence` shape for exactly this; it holds **one row**.

**Monetisation is not the flywheel.** Revenue keeps servers, AI inference,
WhatsApp and payouts alive. It is a cost-recovery mechanism. Any proposal that
would make a free student's experience worse in order to raise conversion is
rejected on sight, regardless of the projected number.

**We do not sell student data.** The data exists to make the product better for
the student who generated it. That is a permanent constraint, not a current
policy.

---

## What we are not

- **Not Topmate.** Topmate monetises an expert's existing audience. We own the
  demand and the student's longitudinal record; a commission model would hand
  away 90%+ of the value on a customer we acquired ourselves.
- **Not an open marketplace.** Students do not browse and compare mentors by
  price. They describe a problem; we route it.
- **Not a content library.** Content is commoditised. Execution and memory are
  not.
- **Not a fear-monetisation machine.** "Your score is falling → buy" is
  forbidden framing. Evidence → relevance → option. Never fear → urgency →
  payment. `docs/OS/TRUST-OS.md` already binds this for the AI layer; it binds
  every surface.
