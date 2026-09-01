# Real-device tester protocol — the one gate software cannot close

**Time needed:** ~20 minutes. **People needed:** one, with an Android phone and an iPhone.
**Why this exists:** everything before subscription creation is verified in CI and
in real Chromium. Everything after it needs a real device, a real push service
and a real OS notification tray. See §7 of `NOTIFICATION-SYSTEM-PRODUCTION-AUDIT-2026-09.md`
for the evidence that this cannot be done from the build sandbox.

**Rule:** a service-worker receipt is **NOT** a visible notification. Only tick
"appeared" if you SAW it in the phone's notification tray.

---

## A. Android (Chrome, installed app) — 8 steps

| # | Do | Expect | Pass? |
|---|---|---|---|
| A1 | Open CareerRai from the home-screen icon | App opens full-screen (no browser address bar) | ☐ |
| A2 | Wait ~2s | A full-screen "Switch on notifications" panel appears | ☐ |
| A3 | Tap **Switch on notifications** | Android's own permission dialog appears | ☐ |
| A4 | Tap **Allow** | Panel disappears, app reloads | ☐ |
| A5 | Send a test push (below) | **A CareerRai notification appears in the tray** | ☐ |
| A6 | Tap the notification | CareerRai opens on the tracker screen | ☐ |
| A7 | Close the app completely, send another | **Notification still appears** | ☐ |
| A8 | Phone Settings → Apps → CareerRai → turn notifications OFF → reopen app | Panel says **"Blocked by your phone"** with "App info → Notifications" steps and an **"I've turned it on — check again"** button | ☐ |

## B. iPhone (Safari Home Screen PWA) — the highest-value rows

**B1–B3 verify the defect fixed in PR #162.** Before that fix the prompt was
silently skipped on this surface — the only iOS surface that has ever worked.

| # | Do | Expect | Pass? |
|---|---|---|---|
| B1 | In **Safari**, open `careerrai.in` → Share → **Add to Home Screen** | Icon added | ☐ |
| B2 | Open CareerRai **from the Home Screen icon** | Full-screen, no Safari chrome | ☐ |
| B3 | Wait ~2s | **The notifications panel appears** ← the fix | ☐ |
| B4 | Tap **Switch on notifications** → **Allow** | iOS permission dialog, then panel closes | ☐ |
| B5 | Send a test push | **Notification appears on the iPhone** | ☐ |
| B6 | Tap it | CareerRai opens on the tracker screen | ☐ |

## C. iPhone (App Store app) — verifying a LIMITATION, not a feature

**This is expected to NOT deliver notifications. That is the correct result.**

| # | Do | Expect | Pass? |
|---|---|---|---|
| C1 | Open CareerRai from the **App Store** app | Opens normally | ☐ |
| C2 | Wait ~2s | Panel: **"Reminders come from the Home Screen app"** + 3 Safari steps | ☐ |
| C3 | Confirm | **No permission dialog ever appears** — asking would be a dead end | ☐ |
| C4 | Tap **Got it** | Panel closes, app usable | ☐ |

---

## Sending the test push

Ask the engineer to POST `/api/push/test` for the student account being tested,
or trigger it from the admin notification-health page. Do not use a broadcast.

## Recording results

For each row: **PASS / FAIL / NOT RUN**, plus device model and OS version.
A single FAIL is enough to stop — report it with what you saw instead.

## What each failure would mean

- **A2/B3 no panel** → the ask is not reaching an installed surface. Highest severity.
- **A5/B5 no notification** → delivery. Everything upstream may still be fine.
- **C3 a permission dialog appears** → we are promising something the surface cannot do. Report immediately.
