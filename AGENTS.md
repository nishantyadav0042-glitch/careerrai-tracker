<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# The mission comes first — `docs/MISSION.md`

**Read `docs/MISSION.md` before anything else in this repo, including this
file's own build rules.** It is the one document that outranks the
Constitutions: it says what the company is for, and it carries the four
questions every new feature must answer before it is designed.

The short version, which is not a substitute for reading it:

> Build a free, massively used student platform that continuously learns how
> Indian students actually study, struggle, decide, improve, interact, and
> eventually achieve outcomes — and use small amounts of monetisation only to
> keep that machine running.

The comparison set is Duolingo and Reddit, not Topmate or Unacademy. Revenue is
fuel, never the destination. A feature that does not make the free product
better for a student who will never pay, and does not deepen what we learn
about how that student studies, does not ship — however much revenue it
promises.

---

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

**Before any operator-surface or "scale" change, read `docs/SCALE-CONTRACT.md`**
— the binding rule that we build today's correct system with a 100,000-student
path, never sacrificing today's student for tomorrow's scale. Student
correctness (P0) outranks founder visibility (P1) outranks scale optimization
(P2). Every count must drill down to the exact records behind it, and every
operational problem is one Exception primitive (`src/lib/os/exception.ts`), not a
new dashboard.

**Before building in a subsystem, read `docs/ENGINEERING-MEMORY.md`** — the
one-page incident INDEX. Scan its table for incidents touching your area, then
grep `docs/ENGINEERING-MEMORY-ARCHIVE.md` for `## Incident #<n>` and read only
those full entries — never the whole archive. Never repeat a logged mistake.
When a new incident happens: full entry in the archive, index row in the same
commit.

**Keep the conversation lean (session hygiene, 12 Aug):** summarize tool
results into the conversation at ≤20 lines — never paste full JSON, HTML, SQL
dumps, or whole large files. Route big outputs to a file and reference the
path. Read files in targeted ranges, not whole. A bloated session compacts,
loses precision, and slows every later task.

**Code orientation:** `docs/CODEMAP.md` — where everything lives, the
load-bearing modules, and the invariants with guard tests. Read it before your
first code change; it is faster than discovering the same map by grep.

**Orientation for anyone (human or AI) new to this repo:**
`docs/KNOWLEDGE.md` is the single knowledge document — what the company is,
the live-state snapshot, the architecture map, the failure patterns already
paid for, and which deeper doc answers which question. Read it before your
first change; update its dated facts the day they change.
