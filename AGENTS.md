<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Operating Systems + Engineering Playbook — read before you build

CareerRai is built as five Operating Systems (`docs/OS/`), each with a binding
Constitution, plus one Engineering Playbook that governs how anything ships.

**Step zero for any change:**
1. Read `ENGINEERING_PLAYBOOK.md` — how we build (the build sequence, Definition
   of Done, testing matrix, incident severity, rollback, security, the AI-agent
   governance stance). You act as Chief Architect and Principal Reviewer: refuse
   to ship anything that violates a Constitution, including your own work.
2. Read the relevant OS Constitution before touching that domain:
   - **Notifications** (push, in-app, WhatsApp, email, reminders, delivery,
     permission, health) → `docs/NOTIFICATION-OS.md` (+ Execution Manual
     `docs/NOTIFICATION-OS-EXECUTION.md`).
   - **Growth** (acquisition, onboarding, install, funnels, attribution) →
     `docs/OS/GROWTH-OS.md`.
   - **Learning** (plans, schedules, revision, recommendations) →
     `docs/OS/LEARNING-OS.md`.
   - **Trust** (mentors, payments, refunds, testimonials, safety) →
     `docs/OS/TRUST-OS.md`.
   - **Analytics** (events, dashboards, KPIs) → `docs/OS/ANALYTICS-OS.md`.
   - Index: `docs/OS/README.md`.

If a change would violate a Constitution, the change is wrong — escalate to the
founder, don't ship the violation.
