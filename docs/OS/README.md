# CareerRai Operating Systems — the company's permanent architecture

CareerRai is built as **five operating systems**, not a pile of features. Each OS
is a durable domain with its own **Constitution** (what it is — philosophy,
principles, non-negotiables; changes rarely, think Linux kernel principles) and
its own **Execution Manual** (how to build and validate against it — workflow,
contracts, testing, a Founder Acceptance Checklist).

**Every AI agent — Claude, Fable, Cursor, Codex, anyone — reads the relevant OS
Constitution before writing a single line of code in that domain.** This is a
durable engineering strategy: the architecture lives in the repo, not in an
ever-larger prompt re-typed each session.

## The five operating systems

| OS | Owns | Constitution | Status |
|---|---|---|---|
| **Notification OS** | every reminder, push, in-app message, reliability, delivery, habit formation | [`NOTIFICATION-OS.md`](../NOTIFICATION-OS.md) + [Execution](../NOTIFICATION-OS-EXECUTION.md) | Full pair |
| **Growth OS** | acquisition, onboarding, install, referrals, experiments, funnels, attribution | [`OS/GROWTH-OS.md`](./GROWTH-OS.md) | Constitution |
| **Learning OS** | study plans, adaptive schedules, revision, recommendations, tutoring | [`OS/LEARNING-OS.md`](./LEARNING-OS.md) | Constitution |
| **Trust OS** | mentor quality, testimonials, moderation, payments, refunds, safety | [`OS/TRUST-OS.md`](./TRUST-OS.md) | Constitution |
| **Analytics OS** | events, dashboards, experimentation, health metrics, business KPIs | [`OS/ANALYTICS-OS.md`](./ANALYTICS-OS.md) | Constitution |

## The Engineering Playbook binds all five

The five Constitutions define *what* to become; **[`ENGINEERING_PLAYBOOK.md`](../../ENGINEERING_PLAYBOOK.md)**
defines *how* every engineer and AI agent must build it — the build sequence,
Definition of Done, testing matrix, incident severity (P0–P3), rollback,
observability, security, and the Chief-Architect governance stance (refuse to
ship anything that violates a Constitution, including your own work). Read it
before you build, alongside the relevant OS.

## How to use these documents

1. **Before building** in a domain, read that OS's Constitution. Identify which
   principles your change touches.
2. **If a change would violate a non-negotiable, the change is wrong** — escalate
   to the founder, don't ship the violation.
3. **When a domain has an Execution Manual**, follow its workflow and pass its
   Founder Acceptance Checklist before calling the work done.
4. **Precedence** (always): the user's explicit words → the project's existing
   system and these constitutions → your own defaults.

## Shared company non-negotiables (true across all five OSes)

- **No invented statistics, ever.** No fabricated testimonials, percentiles, or
  social proof. Real, verifiable receipts only.
- **No silent failures.** If the system breaks and only a student or the founder
  notices — not a dashboard — that is a bug in the OS.
- **Deterministic truth.** Every number the founder acts on must reconcile to its
  source (see Analytics OS: count = list.length from the same query).
- **The repo is public.** No secrets committed — keys live in `server_config` or
  environment, never in code or docs.
- **Value before the ask.** Earn each step (an install, a permission, a payment)
  by delivering value first.
- **Main-only deploys.** Develop on a branch, merge to `main` to release, verify
  the deployment reaches `READY`, confirm in production with real data.

## The two-document pattern (per OS)

- **Constitution** — philosophy, principles, non-negotiables, the KPI, the
  component map, targets. Stable. Reviewed maybe once a quarter.
- **Execution Manual** — the workflow to implement the Constitution: gap
  analysis → violation check → risk → build → test → deploy → rollback →
  acceptance. Evolves with the codebase.

Notification OS has both. The other four have their Constitution today; each earns
its Execution Manual when it next sees substantial build work — same pattern,
authored against the same standard.
