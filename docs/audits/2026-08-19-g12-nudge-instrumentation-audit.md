# G12 — Daily Buddy Nudge Instrumentation

**19 Aug 2026. Read-only audit + event contract.** Instrumentation gate. No copy,
timing, eligibility, routing, conversion or payment logic changes.

---

## 1. Who receives the nudge

`src/app/student/layout.tsx:150` — a **server**-side gate, evaluated per request:

```
showBuddyNudge = noBlockingModal        // !onboarding && !postSignup && !buddyDemo
              && !showCoverageReview    // weekly coverage review outranks it
              && appInstalled           // profiles.app_installed === true
              && !showTimetablePrompt   // first 2 days, coaching students
              && !profile.buddy_id      // has no buddy
              && profile.is_premium !== true
```

Measured population, production today:

| Cut | Students |
|---|---|
| All profiles | 518 |
| Buddy-less and non-premium | 510 |
| **+ `app_installed` — the standing eligible pool** | **349** |
| + past the 2-day timetable window | 307 |

**The 492 figure I used in the ₹299 commit message and in the conversion memo
was wrong** — it omitted `app_installed`, which is a hard gate. The real
standing pool is **349**. Corrected here; the ₹299 reasoning does not change,
because the capacity argument (21 mentor-sessions/week) holds even harder
against 349.

`app_installed` is also **self-healing**: the ingest route sets it true on any
standalone `app_open` (`api/events/track/route.ts:111`). So the pool grows on
its own and any denominator must be recomputed, never cached.

## 2. Where and how often it renders

Mounted once in the student layout, so it is live on every `/student/*` route.
Two independent throttles:

- **Per mount** — `shown` closure flag inside the effect (`:24`), set before
  `setShow(true)`, so the three event listeners (tour done / notif settled /
  insight done) cannot re-fire it.
- **Per day, per device** — `claimDailyModal()` writes `cr_daily_modal =
  <study-day>` to localStorage. **One auto-modal per calendar day across ALL
  competing modals**, not one per modal. The nudge is deliberately last in the
  first-run queue and claims the slot only after a 1400 ms settle, so a blocked
  attempt does not burn the day.

Net: **at most one appearance per student per study-day per device.**

## 3. The actions available, and the one that must not be conflated

| # | Control | Line | Today |
|---|---|---|---|
| 1 | Modal becomes visible | `:33` | untracked |
| 2 | Backdrop click | `:55` | untracked |
| 3 | ✕ close button | `:63` | untracked |
| 4 | Primary CTA → opens pricing sheet | `:93` | `buddy_unlock_open`, **unattributed** |
| 5 | ₹299 rung → `/student/buddy` | `:107` | untracked |
| 6 | "Maybe tomorrow" | `:115` | untracked |

**The trap.** Controls 2, 3, 5 and 6 all call the same `setShow(false)`. Wiring
a dismissal event to that call would record the ₹299 rung — the deepest
engagement on the screen — as an abandonment. That is the "one concept, two
meanings" defect from ENGINEERING-MEMORY #4/#5/#9, and it would make the rung
look like it repels students. **Control 5 is a conversion, and is instrumented
separately from the three dismissals.**

## 4. Event vocabulary — is a new name required?

**Yes, and it is unambiguous.** `EventName` (`src/lib/journey.ts:199`) is a
closed TypeScript union enforced at the call site. The ingest route applies
**no** allow-list (`route.ts:82` takes any string ≤60 chars), so extending the
union is a pure client-side change: **no migration, no schema change, no table.**

House convention, read off existing names — domain prefix, snake_case, `_shown`
for impressions, variants carried in **props** not in the name
(`checkin_shown` / `checkin_answered`, `channel_prompt_shown`,
`pay_escape_browser` + `mode`). The contract below follows it exactly.

### The contract

| Event | Fires | Props |
|---|---|---|
| `buddy_nudge_shown` | once, when the modal is actually rendered | — |
| `buddy_nudge_dismissed` | controls 2/3/6 | `via: 'backdrop' \| 'close' \| 'maybe_tomorrow'` |
| `buddy_nudge_cta` | control 4, alongside the sheet's own event | — |
| `buddy_nudge_rung` | control 5, the ₹299 link | — |

Four names, one prop, no PII. `via` is a fixed enum of three literals, never
free text.

**Impression fires at render, not at claim.** `claimDailyModal()` succeeding is
an *intent* to show; `setShow(true)` is the show. They are the same instant
today, but tying the event to the render keeps them honest if a later guard is
added — and an impression count that can exceed the impressions is exactly the
class of overstatement this project has spent the week removing.

## 5. Duplicate risk

| Path | Duplicates? |
|---|---|
| React re-render / StrictMode double-effect | **No** — the `shown` closure flag guards before `setShow`. |
| Route change within `/student/*` | **No** — layout is not remounted by the App Router. |
| Full refresh, same day | **No** — `claimDailyModal` reads localStorage first. |
| Second device | **Yes, by design.** Per-device throttle. Count distinct `user_id`, not rows. |
| Two tabs opened simultaneously | **Yes, rare.** Both can read localStorage before either writes. Unfixable without a server slot; out of scope for an instrumentation gate. |
| Repeated dismissals | **No** — dismissal unmounts the modal. |
| Repeated CTA taps | **Yes** — the sheet can be opened, closed and reopened. |

Empirical calibration on the closest existing analogue, `buddy_unlock_open`:
83 events across 74 sessions, **mean 1.12, worst 2**. Duplication in this
family is real but small. **Every G12 metric is defined on distinct
`user_id`, never on row counts.**

## 6. The one thing I am NOT inventing — needs a ruling

`buddy_unlock_open` — the 57-person head of the conversion funnel in
`docs/research/BUDDY-CONVERSION-RESEARCH-2026-08-19.md` — **carries no source
attribution**, and `UnlockBuddyButton` is mounted from **three** places:

- `daily-buddy-nudge.tsx`
- `recommended-buddies.tsx`
- `timetable-card.tsx`

So we cannot currently say which surface produced any of those 57 people. A
`source` prop on `buddy_unlock_open` would fix that in one line per call site —
but it changes a **shared** component's API and touches two files outside this
gate's stated scope.

`buddy_nudge_cta` closes the nudge's own half of this without touching anything
shared: a `buddy_unlock_open` preceded by `buddy_nudge_cta` in the same session
came from the nudge. The other two surfaces stay unattributed.

**Not inventing the cross-component change. Reporting it as G12-A for a
separate ruling.**

## 7. What this telemetry will let us decide

- **Is the nudge even being seen?** 349 eligible, one slot a day shared with
  every other modal, gated on a 1400 ms settle and three upstream conditions.
  Impressions could be a small fraction of 349 and nobody would know.
- **Does the ₹299 rung get taken?** The founder's ruling ships blind today.
  `buddy_nudge_rung` / `buddy_nudge_shown` answers it directly.
- **Is dismissal an act or a reflex?** `via: 'backdrop'` (a tap-away) reads very
  differently from `via: 'maybe_tomorrow'` (a considered no).
- **Is the nudge worth its daily slot at all?** It competes with the timetable
  ask, the coverage review and the install journey for one slot a day. Today
  that trade is made on assertion.

## 8. Limitations, stated up front

- **Client-side only.** Anything a beacon loses is lost. Under-counts, never
  over-counts.
- **Not a ledger.** No G12 event may be used to infer payment or entitlement.
  `student_payments` remains the financial source of truth — the corrected
  conversion memo shows client callbacks missing 2 of 4 real payments.
- **Per-device.** A student on phone and laptop can be shown it twice a day.
- **No denominator without a server-side impression.** `buddy_nudge_shown ÷ 349`
  is an approximation: 349 is a snapshot of a self-healing flag, and the
  eligible set is recomputed per request.
