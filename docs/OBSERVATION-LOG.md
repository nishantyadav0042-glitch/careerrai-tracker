# Observation log — the quiet period

Opened 23 Sep 2026, for the observation phase running to the 30 Sep Day-2 memo.

## The rule this log exists to enforce

> **No anecdote becomes a hypothesis worth building from until it repeats.**
> (Founder, 23 Sep 2026.)

An entry here is a *record that something happened*, not a reason to act. An
entry with `n = 1` stays `n = 1` until a later entry says otherwise. If an
observation never repeats, it remains exactly what it was on the day — one
interesting thing that happened once — and the honest outcome is to leave it
here and do nothing.

Three endings are acceptable for anything in this log: a reproducible mechanism
was found, no mechanism was found, or the evidence is still insufficient. The
one unacceptable ending is *"we didn't know, so we built something anyway."*

Each entry states: what was observed, what it establishes, what it does **not**
establish, and n.

---

## 2026-09-23 · A broken streak was repaired without using Restore

**n = 1.**

**Observed.** Ten minutes after the Restore instrumentation deployed
(`d531e9a0`, READY 04:12:33 UTC), one real student produced this sequence:

| IST | event |
|---|---|
| 09:51:59 | `restore_shown` — props `streak: 15, shields: 3` |
| 09:52:25 | logged **22 Sep** at **0.0 hours** (backdated rest day) |
| 09:52:43 | logged **23 Sep** at **3.5 hours** |

Their last previous log was **21 Sep**, so the streak was genuinely broken and
the card rendered correctly. Afterwards: `current_streak 17`, `shields 3`
unchanged, **`restored_dates` empty**.

**ESTABLISHED.** The three events fire, carry accurate props, and Restore's
behaviour is unchanged — the card was shown on a correctly-identified broken
streak. One student repaired a broken streak from 15 to 17 in **44 seconds**,
spending **no shield**, by backdating a zero-hour log for yesterday.

**NOT ESTABLISHED.** That students generally prefer backdating to Restore. That
this explains the 7% lifetime Restore uptake (24 of 332). That the student even
read the Restore card. **n = 1, and one student is not a preference.**

**What it does change.** The earlier reading — *"students don't restore because
they don't care about their streak"* — is no longer the cleanest available
hypothesis. A competing one now exists and is at least as plausible: students
may care about continuity, and Restore may simply not be the cheapest way to
get it, because another shipped path repairs the same state for free.

**Watch for.** A second and third instance. Until then, nothing.

### Deferred — a data-integrity question, not a gamification one

Raised by the founder on 23 Sep and **deliberately not opened**:

> What are all the legitimate ways a student can repair a broken streak today,
> and what does each one cost and record?

At least three paths now write or reconstruct the same underlying continuity
state: a backdated `log_date` (today or yesterday), a zero-hour rest-day log,
and a shield-funded Restore that writes `restored_dates`. Several routes to one
state is worth knowing precisely **before** anyone changes any of them.

This is deferred, not scheduled. Product changes are frozen, and this is not an
integrity *problem* — no state is known to be wrong. It is written down so that
the day someone proposes touching Restore, this question gets answered first.
