# Buddy profile & specialist model — spec for review

**Written 13 Aug 2026. Not built. Founder decisions marked ❓ at the end.**

The goal is the "why this Buddy" page, not a mentor profile page. Everything
below exists to make one sentence computable and true:

> *You're seeing Shreya because your mocks have been flat for four attempts,
> and mock analysis is what she does.*

---

## 0. The one architectural decision

**Services and specialities are the same list.** Not two concepts.

A mentor's bookable session types ARE their specialities. That is what
"not everyone is allowed to do everything" means in a schema: a mentor who is
not a specialist in consistency cannot be booked for a consistency session.
The cap is not a UI rule, it is the product.

And the list must be the **answer-side of the diagnostic vocabulary we
already emit**. If mentor tags come from a different vocabulary ("interview
prep", "GD-PI"), matching stays decorative forever.

| Student finding (`buddy-case.ts`) | Speciality that answers it |
|---|---|
| `mock_plateau`, `mock_drop` | **Mock analysis** |
| `no_strategy`, `behind_timeline` | **Strategy & planning** |
| `consistency` | **Consistency & routine** |
| `repeating_pattern` | **Second attempt** |
| weak section (QA/VARC/DILR) | **Section depth** — the mentor's strongest section |

Five specialities. Each one already has a detector behind it, so every tag a
mentor claims is a tag we can match against real evidence.

---

## 1. Fields to collect

### Tier 1 — required before the ₹299 card can go live

| Field | Type | Why it is Tier 1 |
|---|---|---|
| `photo_url` | text | **Zero of 8 mentors have one.** Largest trust gap on the card. Initials fallback already built, so this is upgrade-not-blocker |
| `specialities` | text[] **max 2** | The whole matching story. Also the service cap |
| `strongest_section` | enum QA/VARC/DILR | Matches a student's weak section to a mentor's strong one |
| `weekly_session_cap` | int | **The field that stops us overselling ₹299.** Without it "sold out" is a guess and we book sessions nobody can deliver |
| `story` | text (2 lines, their words) | The only thing that makes her a person and not a résumé. 1 of 8 has this today |

### Tier 2 — makes matching genuinely good

| Field | Type | Why |
|---|---|---|
| `own_weakest_section` | enum | **The most persuasive field we could hold.** "Shreya's weakest was VARC too" to a student stuck in VARC is a fact, not a pitch |
| `attempt_number` + `previous_percentile` | int, numeric | Lets a repeater be matched to someone who repeated. Note: `is_repeater` is currently **false for all 8** — almost certainly never asked, not actually false |
| `languages` | text[] | Matters enormously in India. We do not ask at all |
| `notice_hours` | int | Decides what we can honestly promise at checkout ("within 48h" vs "this weekend") |

### Tier 3 — before money moves

`per_session_payout` (int, paise) and UPI — you may already hold UPI for the
monthly payout flow.

### Already held — do not re-ask

`full_name`, `iim_converted`, `cat_percentile`, `college`, permanent Google
Meet room, `agreed_monthly_payout`.

---

## 2. The cap, and how it is enforced

**Max 2 specialities + 1 strongest section.**

Two, not three. With eight mentors, three-of-five means everyone overlaps and
"specialist" stops meaning anything. Two forces a real choice.

Enforced in three places, because a UI-only cap rots:

1. `CHECK (array_length(specialities, 1) <= 2)` on the column
2. The form disables further options at 2
3. Admin override for genuine exceptions, logged

**Booking rule:** a student may only book a session type that is in that
mentor's `specialities`. No overlap between the student's finding and the
mentor's tags → they are shown a different mentor, not a generic session.

### Claimed vs earned — say it plainly

At 8 mentors these are **self-declared**. That is the honest v1 and we should
not dress it up. The column should be designed so it can become *earned*
later — outcome data per finding type, once enough sessions exist to rank on.
Until then, no "top rated", no strength bars, no "helped 43 students".

---

## 3. Verification — a real decision, not a detail

The design puts **"✓ Verified by CareerRai"** on the card. Today we verify
nothing; the IIM and the percentile are typed in by the mentor.

Two honest options:

- **Collect proof** (IIM ID or admit letter) → `verified_at`, `verified_by`,
  and the badge means something.
- **Drop the badge.** Show the IIM and percentile as their claim.

What we must not do is badge "Verified" against an unverified field, on the
most trust-critical line of a page where we ask for ₹299. It is the same
class of error as the ~50% statistic, and it fails in the worst possible
place: the session the student paid for.

---

## 4. Rollout — new vs existing mentors

**New mentors (buddy #9 onward):** Tier 1 becomes step 2 of `/buddy/setup`,
which today collects only name / percentile / IIMs / college. Gate the
dashboard on completion — a mentor with no specialities cannot be matched, so
an incomplete profile is a mentor who does not exist to the system anyway.

**The existing 8:** a completion card on their dashboard that says what is
missing and **why it matters to them** — "students are matched to specialists;
add yours to be matched" — not a nag. Dismissible per session, returns until
complete. **Do not hard-block them.** They are delivering sessions today, and
locking out working mentors to collect data is backwards.

> Honest recommendation: for 8 people, WhatsApp them the five Tier-1 questions
> and have the answers backfilled directly. Build the form for mentor #9. The
> completion card is worth building anyway — it is how the field stays fresh —
> but it should not be the path that unblocks the ₹299 launch.

---

## 5. Deliberately NOT collected

Follower counts · ratings · testimonials · portfolios · hourly rates ·
multiple price tiers · public reviews · mentor rankings · availability slot
pickers.

All of it is marketplace furniture that needs volume we do not have. Ratings
over 8 mentors and ~13 completed sessions would publish how small we are —
the same no-small-numbers rule that governs every other surface.

---

## ❓ Founder decisions

1. **Verify the IIM claim, or drop the "Verified" badge?**
2. **Self-declared specialities, or assigned by you after seeing them work?**
   Assigning is slower but makes "specialist" real from day one.
3. **Max 2 specialities — agreed?** (vs 3, which at 8 mentors means everyone
   overlaps)
4. **Photo: required or optional?** Zero have one today; requiring it delays
   every existing mentor.
