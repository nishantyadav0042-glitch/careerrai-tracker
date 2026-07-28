# Habit research — how the loop actually forms, and where ours is broken

**Question:** students must feel the loop within 2–3 days or they don't come
back. How do Inshorts, Duolingo and the science say that happens — and what is
CareerRai's version?

Evidence tags per docs/EVIDENCE-POLICY.md. External claims are CITED with the
source; our own numbers are VERIFIED from production.

---

## 1. First, the technical question: "notifications only arrive when I tap the app"

Two different things are happening, and they need different answers.

**For 182 of 246 students — VERIFIED — there is no push channel at all.**
They have no live subscription. The only "notifications" they can ever see are
the in-app bell, which by definition appears only when the app opens. That is
not a delivery failure; it is the absence of a channel. 11,955 notification
rows were never pushed, and 11,061 of those belong to these students.

**For the 64 with push, Android parks Chrome.** Our TWA uses *web push* —
Chrome's channel, not a native app's FCM channel. When the phone sleeps, Doze
queues web pushes until Chrome next wakes — which is often the moment the
student picks up the phone or opens the app. That is exactly the symptom
described. CITED: Chrome's own tracker confirms high-priority web pushes cannot
reliably wake the browser in Doze
([chromium push-notifications-dev](https://groups.google.com/a/chromium.org/g/push-notifications-dev/c/gWsM4Hg2JZE),
[Pushy on Doze](https://support.pushy.me/hc/en-us/articles/360043423332-How-can-I-send-notifications-to-Android-devices-in-Doze-power-saving-mode)).

Our own delivery data shows the same shape — VERIFIED: `welcome_verify`, sent
while the student is in the app, delivers **96.9%**. `buddy_evening` at 19:30
(phone in hand) delivers **60.5%**. Daytime companion slots deliver 26–35%.
Delivery tracks device use, not our code.

**"Zero failure" is therefore not achievable with web push.** It is a platform
property. A native Android app using high-priority FCM would improve it
(CITED above) and Indian OEM battery killers would still take a cut. The
correct responses are the ones already made: measure delivery honestly, send
in the windows when phones are in hand, and stop making push carry the habit.

---

## 2. What Inshorts actually does, and the psychology

Inshorts' famous property: **the notification IS the content.** A 60-word
headline delivers its value in the notification shade — you are rewarded
without opening anything. Their notifications are gifts, not demands. Combined
with IST rhythm — engagement peaks 9–10 AM, 1–2 PM, 7–9 PM — and ruthless
personalisation, because Indian users uninstall spammy apps fast. CITED:
[Pushwoosh news-app study](https://www.pushwoosh.com/blog/push-notifications-news-apps/),
[Product Growth Intelligence on Indian push strategy](https://productgrowth.in/resources/guides/push-notification-strategy/),
[Idea Usher on the Inshorts model](https://ideausher.com/blog/how-to-develop-short-news-app-like-inshorts/).

**Every notification we send is a demand.** "Fill your log." "Open the app."
Inshorts never asks; it gives. That is the transferable lesson — not the
frequency.

**Does the same psychology work on students? Partly, and the difference
matters.** Inshorts feeds novelty-hunger; a CAT aspirant's itch is *anxiety* —
"am I doing enough? what should I do right now?" A student's version of a
60-word headline is not news. It is an answer:

- Morning: **"Today: Geometry first, 2 RCs, 1 DILR set."** (the plan, in the shade)
- Evening: **"You're 2 days consistent. 15 seconds seals day 3."** (progress, in the shade)

Value delivered before the tap. The tap becomes optional the way Inshorts'
tap is optional — and paradoxically that is what earns it.

---

## 3. What the science honestly says about "fast"

**A habit cannot form in 2–3 days.** CITED: Lally et al. 2010, the landmark
real-world study — automaticity takes a **median 66 days**, range 18–254
([Wiley](https://onlinelibrary.wiley.com/doi/10.1002/ejsp.674),
[BPS digest](https://www.bps.org.uk/research-digest/how-form-habit)). Two
findings from the same study matter more for us: the behaviour must be
anchored to a **stable daily cue**, and **missing a single day does not derail
formation** — which is exactly what our shield/restore design assumes.

**But the 2–3 day instinct is still right — it's just measuring a different
thing.** What is decided in the first 3 days is not the habit; it is whether
the 66-day process *ever starts*. Duolingo's own data: the day 0–7 window is
where streaks are won or lost, their streak commitment during onboarding is
shown before signup even completes, and a streak-wager feature lifted D7
retention by 14%. CITED:
[Deconstructor of Fun on Duolingo streaks](https://duolingo.deconstructoroffun.com/mechanics/streaks),
[PM Repo breakdown](https://www.thepmrepo.com/articles/how-duolingo-gamified-monthly-active-users-lessons-in-habit-formation).

What makes day 2 happen is **anticipated reward**: day 1 must end with the
brain predicting value tomorrow. Duolingo's notification is not "open the
app" — it is "don't lose the thing you own."

**One caution on the Hooked model:** the trigger→action→variable-reward→
investment loop is the standard frame, but reviewers note most successful
products actually use **reliable** rewards, not variable ones
([Big Think review](https://bigthink.com/wikimind/an-incomplete-loop-a-review-of-hooked-by-nir-eyal/),
[Amplitude](https://amplitude.com/blog/the-hook-model)). For an anxious
exam-prep student this is doubly true: the reward they crave is *certainty* —
the app always answers "what now?" Do not gamify CareerRai with randomness.

---

## 4. Where OUR loop is broken — from our own data

- **VERIFIED:** installed students log **8.8×** more than non-installed on
  days with zero pushes. The home-screen icon is the cue that Doze can never
  throttle. Lally's "stable context cue" is, for us, the install.
- **VERIFIED:** 64% of students who open the log complete it; every
  notification-driven log arrived within 0–3 minutes of the tap. The action
  works. **The trigger and the reward are what's missing.**
- **VERIFIED:** all evening logs cluster 20:00–22:30 IST.
- **The broken stage is the reward.** Submitting a log currently returns… a
  refresh. The student gives us data and visibly receives nothing. Tomorrow's
  plan does adjust — but silently. The loop's payoff exists and is invisible,
  which is the same as not existing.

## 5. The CareerRai 72-hour loop

**Day 0 (first session):** first log happens in-session (already built).
Immediately after submit: streak = 1, big, plus **one specific consequence** —
"Because of what you told us, tomorrow starts with Averages." End with a
promise: "Your adjusted plan will be waiting at 7:30."

**Day 1 morning:** the plan header says *why*: "Yesterday you didn't finish
Geometry — it's first today." This is the moment the loop closes: *my input
changed my plan.* A generic "plan adjusted" line exists today; it must become
specific to be felt.

**Day 1 evening (20:30):** one message that gives before it asks: "2 days of
honest tracking. 15 seconds seals day 3."

**Day 2:** the check-in gate (built) catches a miss without shame; the
"because you said X" morning repeats. By day 3 the student has seen
input→consequence three times. That is the loop being *felt* — the habit
itself takes the 66 days, carried by the icon on the home screen and the
WhatsApp channel at 7:30 and 21:30.

**The one build that matters:** the consequence line — log submit shows what
changed for tomorrow, and the morning plan says because-of-yesterday. Both
ends of the same thread. Everything else on the habit list is secondary to
closing that loop.
