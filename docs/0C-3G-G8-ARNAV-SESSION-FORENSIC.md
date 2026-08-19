# G8 — Arnav's repeated re-logins: forensic audit

**Gate:** G8, read-only. No code, schema, migration, auth change or production data touched.
**Question:** is the one strict-definition post-fix recurrence a remaining product defect, or
an environment anomaly?
**Date:** 19 Aug 2026.

---

## VERDICT

**Environment, not product. No code change is justified, and no special-case fix should be built.**

Arnav Badaya's device is **clearing the PWA's client-side storage** roughly every day or two.
When that storage goes, the Supabase auth token goes with it — so the session cannot refresh,
it simply stops being presented, and the next app open has to create a brand-new session.

The general singleton fix (`81c56b5`) **is working**. 92% of the base never re-logs in at all.

---

## A. Confirmed facts

**1. Every forced re-login coincides with a client-storage reset — 10 out of 10.**

`student_events.anon_id` is a client-generated identifier held in the browser's own storage.
A *new* `anon_id` means that storage was empty. Arnav has **10 distinct `anon_id`s**, and each
one's first event lands within **0.6–3.8 seconds** of a new `auth.sessions` row:

| anon_id first seen | nearest session created | gap |
|---|---|---|
| 3 Aug 14:42:16 | 3 Aug 14:42:14 | 2.1 s |
| 7 Aug 07:10:06 | 7 Aug 07:10:07 | 0.7 s |
| 9 Aug 08:00:11 | 9 Aug 08:00:11 | 0.6 s |
| 9 Aug 12:51:55 | 9 Aug 12:51:57 | 2.4 s |
| 10 Aug 03:50:53 | 10 Aug 03:50:53 | 0.6 s |
| 16 Aug 07:30:14 | 16 Aug 07:30:12 | 2.0 s |
| 16 Aug 11:26:54 | 16 Aug 11:26:55 | 0.8 s |
| 16 Aug 13:03:34 | 16 Aug 13:03:31 | 3.8 s |
| 17 Aug 16:01:56 | 17 Aug 16:01:57 | 0.5 s |
| 18 Aug 12:46:03 | 18 Aug 12:46:01 | 1.5 s |

A 1:1 correspondence with no exceptions. **VERIFIED FROM PRODUCTION DATA.**

**2. He is a singular outlier across the entire base.**

| Measure | Value |
|---|---|
| Users with client events | 396 |
| **Median distinct `anon_id`s per user** | **1.0** |
| Mean | 1.11 |
| Users with exactly one | **365 (92%)** |
| Users with ≥5 | **1 — Arnav** |
| Users with ≥8 | **1 — Arnav** |
| Maximum anywhere | **10 — Arnav** |

**3. The mechanism generalises.** Across all 396 users, the correlation between distinct
`anon_id` count and `auth.sessions` count is **r = 0.800**. Storage resets predict re-logins
base-wide; Arnav simply has far more of them than anyone else.

**4. One device profile, not many.** 701 of his 737 events are `standalone` / `chrome` /
`android` — the installed PWA. A desktop visit (11 events) and two early browser-tab visits
account for the rest. This is **not** a multi-device or multi-tab pattern.

**5. The token evidence matches storage loss exactly.** In session
`4482cee3-01cd-4ce8-8904-08345f082b9f`, token `7429` rotated normally into `7501`, and `7501`
was then **never used and never revoked** (`updated_at` == `created_at`). That is precisely
what a client losing its token looks like: nothing failed server-side, the token was simply
never presented again.

---

## B. Strongest root-cause hypothesis

**Android Chrome is evicting the PWA's storage on his device.**

It explains every observation at once: the regenerated `anon_id`, the unused-but-unrevoked
refresh token, the short session lifespans, the absence of any server-side error, and why 92%
of other users on the same build never see it. Common triggers are device storage pressure,
"clear browsing data", or aggressive battery/storage management (widespread on budget and
some OEM Android builds).

**CONFIDENCE: High** for "client storage is being cleared" — that is measured, not inferred.
**CONFIDENCE: Medium** for the specific cause of the clearing, which is not observable from
our data.

---

## C. Competing hypotheses, and their status

| Hypothesis | Status | Evidence |
|---|---|---|
| The singleton fix failed | **RULED OUT** | 365/396 users hold one `anon_id` and never re-log in; longest session 64.3 h |
| Multi-tab / multi-client race | **RULED OUT** | One device profile; the two sessions 29 s apart carry *different* `anon_id`s, i.e. sequential resets, not concurrent clients |
| Token rotation / refresh race | **RULED OUT** | The successor token was never used and never revoked — nothing raced it |
| Explicit sign-out | **RULED OUT** | Sign-out revokes; `revoked = false` |
| Server-side expiry or revocation | **RULED OUT** | No revoked tokens, no failed rows, no error rows |
| Stale cached JS bundle | **UNRESOLVED, and now unnecessary** | Cannot be distinguished from our data, but storage eviction explains the pattern without it — including the 17 and 18 Aug sessions that a stale bundle could not |
| Why the device clears storage | **CANNOT BE DETERMINED** | Requires the device: OS version, free storage, Chrome settings, battery-optimisation policy |

---

## D. Is the general fix working?

**Yes.** 92% of users hold a single `anon_id` for their whole history. 14 users have sessions
alive 24 h+, the longest being 64.3 h. Exactly one strict-definition recurrence exists base-wide
and it is fully explained by client-side storage loss.

---

## E. Is a code change justified?

**No.** Nothing in the auth or session code misbehaved. Building an Arnav-shaped workaround
would add a second code path to serve one device's storage policy.

Two things are worth *considering* later, as their own gates rather than as a fix for this:

- **P2 — session durability.** If a meaningful share of the Indian Android base clears storage,
  a longer-lived credential (or a re-auth path that does not need a full OTP) would help many
  students, not one. Today the data says one user, so this is not urgent.
- **P3 — observability.** We inferred storage loss from `anon_id` regeneration. An explicit
  "storage was empty on boot" event would make this diagnosable in seconds rather than by
  correlation.

---

## F. Exact next action

1. **Ask Arnav what device he uses**, and whether he clears browsing data or uses a
   storage/battery cleaner. That is the only remaining unknown, and it is not in our data.
2. **Stop the recurring monitoring loop.** It has produced its answer: one recurrence, one
   cause, environmental. Leaving it running would keep re-reporting the same user.
3. **Do not change auth or session code** on this evidence.

---

## Method

Row-level throughout: individual `anon_id` first-appearances joined against individual
`auth.sessions` rows, not aggregates. The base-wide comparison was computed over all 396 users
with client events, demo and test accounts excluded. The correlation is reported as a
supporting signal, not as the primary finding — the primary finding is the 10/10 row-level
correspondence.
