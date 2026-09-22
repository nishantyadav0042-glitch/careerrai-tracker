# Security review — 22 September 2026

Independent review of the application, not a restatement of the dependency
upgrade. Scope: the ten domains the founder specified. Every finding carries
evidence, exploitability, blast radius, remediation and verification.

**Headline: three findings, none exploitable. Two were defects in the
remediation rather than in the application, and are already fixed.**

---

## Findings

| # | Finding | Class | Exploitability | Blast radius | Status |
|---|---|---|---|---|---|
| 1 | `next` exact pin turned into a range | Supply chain | Not exploitable today | Build inputs | **Fixed** `ed6fc78` |
| 2 | Unbounded `>=` in `overrides` | Supply chain | Not exploitable today | Build inputs | **Fixed** `ed6fc78` |
| 3 | 4 of 5 GitHub workflows declare no `permissions:` | Hardening debt | Requires a prior compromise | `GITHUB_TOKEN` scope | **Open — not blind-fixed** |
| 4 | `/api/push/received` is unauthenticated | Informational | Requires knowing a notification UUID | Delivery telemetry only | **Open by design** |

---

### 1 & 2 — supply chain (fixed)

**Evidence.** `main` pinned `"next": "16.2.11"` with no caret; `next`, `react`
and `react-dom` are the only three exact-pinned dependencies in the file. The
security upgrade rewrote it to `"^16.3.6"` and added `"sharp": ">=0.35.4"`,
`"baseline-browser-mapping": ">=2.11.0"` — `>=` accepts any future **major**.

**Exploitability.** None today; the lockfile pins exact versions. The risk is
that a future `npm install` outside the lockfile silently accepts an
unreviewed minor of a forked framework, or a hostile major of a transitive
dependency.

**Remediation.** Exact pin restored; ranges bounded with `^`.
**Verification.** Resolved versions unchanged (next 16.3.6, sharp 0.35.4, bbm
2.11.25); `npm audit` 0; build exit 0; 6,727 tests; lint 0 errors.
**Residual risk.** None identified.

---

### 3 — workflow permissions (OPEN, deliberately not fixed)

**Evidence.** Only `security.yml` declares `permissions: contents: read`.
`ci.yml`, `cron-fallback.yml`, `vercel-deploy.yml` and `build-android.yml`
declare none, so each runs with the repository's **default `GITHUB_TOKEN`
scope** rather than least privilege.

**Exploitability.** Not directly exploitable. It is an amplifier: it widens
what a compromised action or a malicious dependency in a workflow could do.
No `pull_request_target`, no script injection, and every third-party action
is SHA-pinned — so there is no current path to reach it.

**Why this is NOT fixed in this pass.** Adding `contents: read` blindly could
break a workflow that legitimately needs write (a deploy status, a release, a
commit). **That is the `is_admin` lesson applied**: a scanner-style
recommendation must be traced against what the thing actually does before the
privilege is changed. Each workflow's required scopes should be established
first, then declared explicitly.

**Remediation (proposed).** Per workflow, declare the minimum verified scope;
`contents: read` for `ci.yml` and `security.yml`; establish what
`vercel-deploy.yml`, `cron-fallback.yml` and `build-android.yml` genuinely
require before restricting.
**Residual risk until done.** Excess standing privilege, no known reach.

---

### 4 — `/api/push/received` unauthenticated (open by design)

**Evidence.** The route takes a notification `id` from the request body, marks
the delivery confirmed and stamps `push_verified_at` on the owning profile,
with no session check.

**Exploitability.** Requires knowing a notification UUID, which is not
enumerable. No data is returned to the caller.

**Blast radius.** **Delivery telemetry integrity only** — no student data is
read, written or exposed. A party holding valid ids could falsify delivery
statistics. That matters more than it sounds given Incident #102: these are
exactly the numbers a push strategy is being decided on.

**Why it is unauthenticated.** It is the service-worker receipt beacon. The
Incident #102 fix turns on that beacon always landing; making it fail closed
on a session edge case would reintroduce the defect it was built to fix.

**Proposed hardening (not urgent).** Bind the receipt to the endpoint that
was actually pushed to, so an id alone is insufficient.
**Residual risk.** Telemetry falsification by a party holding notification ids.

---

## Traced and cleared — the checks that found nothing

Recorded because a review that lists only its findings cannot be told apart
from a shallow one.

- **207 API routes enumerated.** Every `admin/*` route authorises, not merely
  authenticates — via `isRequestAdmin()` or an explicit
  `me?.role !== 'admin'` → 403. **Two of my own scans produced false
  positives** (missing `isRequestAdmin`, then missing the inline role check);
  both were my regex, not the code.
- **IDOR sweep.** 25 routes take an identity from the request *and* write.
  24 are guarded. The 25th, `install/exchange`, is the PWA hand-off and is
  sound: a 192-bit single-use token (`randomBytes(24)`), burned before any
  other work, expiry checked, and **identity established by Supabase's own
  `setSession()` validation** — the `user_id` on the row only picks a redirect.
- **`user_role` cookie is a routing hint, not an authorization grant.** It is
  read in three places: a diagnostic log, a logged-out `/login` vs `/start`
  choice, and a post-authentication redirect. `/admin/layout.tsx` calls
  `requireAdmin()` regardless, so a forged `user_role=admin` lands on `/admin`
  and is bounced. Traced end to end rather than assumed.
- **Payments.** Both inbound paths verify signatures with `timingSafeEqual`.
  Order amounts derive server-side from the pricing authority; the browser
  sends a plan id, never an amount. Activation is guarded by a status
  precondition and a UNIQUE constraint.
- **Database.** 25 SECURITY DEFINER functions, **`anon` EXECUTE false on all
  of them**; 41 functions carry a fixed `search_path`. Inventory:
  `docs/security/SECURITY-DEFINER-INVENTORY.md`.
- **CI/CD.** No `pull_request_target`. No `${{ github.event.* }}` interpolation
  inside `run:`. Third-party actions SHA-pinned. The Android signing keystore
  is decoded to disk but **not** in the artifact upload (explicit `.aab`/`.apk`
  paths) and is removed with `if: always()`.
- **Headers.** HSTS, `X-Frame-Options: SAMEORIGIN`, `nosniff` and
  `Referrer-Policy` are applied to every response. **No CSP** — a documented
  deliberate choice, because an enforced policy risks breaking the Razorpay
  checkout iframe and microphone-based voice notes. Standing accepted risk,
  not an oversight.
- **Secrets.** No literal credential in the working tree. Three history
  patterns (`rzp_live_`, `sk_live_`, `BEGIN PRIVATE KEY`) traced to a
  live-vs-test prefix check, a comment describing an env var format, and
  Semgrep's own rule definitions — **all false positives**.

---

## The one open security action

**Credential rotation**, tracked as Incident #105 and unchanged by this review.
It is the only item whose remediation lives outside the repository: everything
else here is either fixed or enforced by something that fails.
