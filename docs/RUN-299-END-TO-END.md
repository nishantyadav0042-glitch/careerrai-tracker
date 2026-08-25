# Running the real ₹299 journey

The database probes proved what the database can refuse. They cannot prove
Razorpay redirects correctly on an iPhone, that a Meet link opens, or that a
reminder arrives. This is the run that does.

**Last updated 26 Aug 2026.** Production is `11a9ff0` — it does **not** yet have
the Phase 2B lifecycle states or the 2C atomic booking RPC. Read step 9 before
deciding when to run the concurrency check.

---

## 0. The one thing blocking this today

Not Google. `mentorBookability()` accepts `google_calendar_connected === true`
**OR** `buddy_meet_url != null`, and `ensureBuddyRoom()` returns a manually-set
room *before* it looks at any Google connection — the comment in
`src/lib/buddy-room.ts` says why: *"Requiring Google here was a design mistake…
A pasted link satisfies that need completely."*

Production, 26 Aug:

| mentor | room | `buddy_meet_event_id` | availability rows | cap | what's missing |
|---|---|---|---|---|---|
| Shreya Bendigeri | real Meet link | NULL (manual path) | **0** | 3 | **only availability** |
| Sweccha Mishra | real Meet link | NULL | 0 | 0 | availability + cap |
| everyone else | none | — | 0 | 0 | a room, then availability |

No mentor in production holds a Google OAuth token. None needs one.

**Action:** Shreya logs in, opens **Sessions** (`/buddy/schedule`), sets her
days and hours, saves. That writes the `buddy_availability` row and she becomes
bookable. It must be *her* hours — nobody else can answer when she is free, and
a row invented on her behalf books a real person into a real call.

Verify:

```sql
select p.full_name, a.work_days, a.start_minute, a.end_minute, a.active
  from profiles p join buddy_availability a on a.buddy_id = p.id
 where p.full_name = 'Shreya Bendigeri';
```

---

## 1–9. The chain, with what to check after each step

Use a real student account and a real ₹299 payment. Dhruv's existing credit is
**not** the right vehicle — it is evidence in Incident #31 and is mid-recovery.

| # | Step | Check |
|---|---|---|
| 1 | Student picks ₹299 and states an intent | `student_payments.session_intent_all` has 1–3 kinds, element 1 = primary |
| 2 | Razorpay opens **on one tap** — no copy/paste, no handoff screen | on iOS this is the fix from PR #102; if a UPI app bounces back to home, that is the open native defect, record it and continue on a card |
| 3 | Payment completes | `student_payments.status = 'paid'`; the callback route returns 303, **never** 405 |
| 4 | Credit is minted | exactly one `session_credits` row, `status='paid'`, `payment_id` set |
| 5 | Mentor assigned | `buddy_id` set, `status='assigned'` |
| 6 | Student sees real slots | picker shows `choose_slot`, not `awaiting_assignment` / `needs_team` / `no_slots` |
| 7 | Student books one | **one** `video_sessions` row; credit `status='scheduled'` and `video_session_id` = that row |
| 8 | Both parties join the Meet link | the link is Shreya's permanent room; the student knocks and she admits |
| 9 | Mentor starts, then completes | `video_sessions.session_status` `active` → `completed` with `ended_at`; only THEN can the credit become `completed` |
| 10 | Student leaves feedback | `session_feedback` row |
| 11 | The 3-message entitlement still holds | chat allows exactly 3, then stops |

One query for steps 4–9:

```sql
select c.status as credit, c.buddy_id is not null as has_mentor,
       c.video_session_id is not null as linked,
       v.session_status, v.scheduled_at, v.google_meet_link is not null as has_room,
       c.owner, c.next_action
  from session_credits c
  left join video_sessions v on v.id = c.video_session_id
 where c.student_id = '<student uuid>';
```

**Any row where `has_mentor` is true, `linked` is false, and the credit has sat
past its SLA is the Dhruv shape.** After 2B ships it will say so itself, in
`status`, `owner` and `next_action`.

---

## 9b. The two-simultaneous-taps check — AFTER the production apply, not before

Same student, same credit, two POSTs at once. From the student's browser console
on `/student/buddy` (the session cookie travels automatically):

```js
const body = JSON.stringify({ startIso: '<the ISO slot from the picker>' });
const go = () => fetch('/api/sessions/schedule', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body,
}).then(r => r.json());
console.log(await Promise.all([go(), go()]));
```

Expected **after 2C is live**:

```
[ { ok: true, sessionId: X },
  { ok: true, sessionId: X, already: true } ]     <- same X
video_sessions for this credit ....... exactly 1
session_credits.video_session_id ..... exactly X
```

**Do not run this on today's production.** Without 2C the two calls each insert
a session, one link wins, and the loser is returned to the student as a success
— it would leave a real orphaned session on Shreya's calendar and burn the
student's slot. Reproducing a bug we have already reproduced on test, at a real
mentor's expense, buys nothing.

---

## What this run is allowed to conclude

- **It passes** → approve `20260826b` + `20260826c` to production together,
  then re-run step 9b as post-deploy verification.
- **It fails at step 2 on a UPI deep link** → that is the known native-shell
  defect (no `apple-app-site-association`, non-HTTP schemes cancelled by
  WKWebView). It does not block 2B/2C.
- **It fails anywhere in 4–9** → that failure is the point of the run. Capture
  the row state with the query above before touching anything.
