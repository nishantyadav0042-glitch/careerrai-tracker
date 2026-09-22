# Security review — 22 September 2026

Independent review of the application, separate from the dependency upgrade.

## Conclusion, in evidence language

> **No exploitable vulnerability was identified in the reviewed scope.** Two
> review-detected supply-chain regressions, introduced by the same day's
> remediation, were fixed before production. One CI/CD least-privilege finding
> was analysed workflow-by-workflow and closed. The push receipt endpoint is
> intentionally unauthenticated and is classified informational, with a
> telemetry-integrity abuse analysis recorded. CSP remains an accepted,
> documented risk with a review date. **Credential rotation remains the only
> remediation action outside the repository.**

That is deliberately not "three findings, none exploitable" — this review
traced and cleared a set of paths; it did not prove non-exploitability.

---

## Findings

| # | Finding | Class | Status |
|---|---|---|---|
| 1 | `next` exact pin turned into a range | Review-detected remediation regression | **Fixed before production** (`ed6fc78`) |
| 2 | Unbounded `>=` in `overrides` | Review-detected remediation regression | **Fixed before production** (`ed6fc78`) |
| 3 | 4 of 5 workflows declared no `permissions:` | Hardening debt | **CLOSED** — analysed and set |
| 4 | `/api/push/received` unauthenticated | Informational / integrity | **Open by design**, analysed below |

**#1 and #2 are not weaknesses CareerRai carries.** They existed for roughly
two hours inside the same day's security work and were caught by this review.
They are recorded because the lesson matters — a security patch can introduce
a supply-chain regression — not because the repository is exposed to them.

---

### 3 — CI/CD least privilege (CLOSED)

Analysed per workflow rather than blanket-applied, because a wrong
`contents: read` breaks a deploy. This is the `is_admin` rule: trace what the
thing actually does before changing the privilege.

| workflow | uses `GITHUB_TOKEN` | checks out | GitHub API writes | minimum set | reducible |
|---|---|---|---|---|---|
| `ci.yml` | No | Yes | No | `contents: read` | Yes |
| `vercel-deploy.yml` | No | Yes | No — Vercel CLI uses its own `VERCEL_TOKEN` | `contents: read` | Yes |
| `build-android.yml` | No | Yes | No — `upload-artifact@v4` uses the **Actions runtime token** | `contents: read` | Yes |
| `cron-fallback.yml` | No | **No** — no `uses:` at all, pure `curl` | No | **`{}`** (none) | Yes |
| `security.yml` | No | Yes | No | `contents: read` (already declared) | — |

**Applied.** All five now declare a minimum. Verified by parsing each file:
four at `{'contents': 'read'}`, `cron-fallback` at `{}`.

**Residual risk.** None identified. If a future step needs a write scope it
must be added explicitly, which is the point.

---

### 4 — `/api/push/received` (informational, by design)

**Unauthenticated ≠ unauthorized.** The route is reachable without a session
because it is the service-worker receipt beacon and the SW may hold none.
Authorization is enforced by what it will accept, not by who calls it.

Abuse analysis, answered from the source:

| question | answer | evidence |
|---|---|---|
| Enumerate notification UUIDs? | **No** | v4 UUID (~122 bits); no unauthenticated endpoint lists or returns ids |
| Manufacture arbitrary UUIDs? | Syntactically yes, usefully no | format-validated, but the space is ~2^122 against ~10^5 rows |
| Alter another student's telemetry? | **Only with an id they already hold** | write is `.is('received_at', null)` — **set-once**, cannot overwrite or clear |
| Inflate metrics materially? | **Bounded by id possession** | marking N deliveries needs N valid ids; no enumeration path |
| Rate limited? | **No** | no application rate limiter exists; platform limits only |
| Reveals whether a UUID exists? | **Partially** | `device` returns `confirmed`/`already` vs `rejected`, so a *fully valid pair* is distinguishable — but both ids must already be known |
| Storage / DB cost? | **No row growth** | UPDATE only, never INSERT; unbounded request volume is DB load, not storage |

**Classification: integrity / abuse risk, not data compromise.** No student
data is read, written or returned. The realistic worst case is falsified
delivery statistics by a party who already holds notification ids.

**That is not nothing.** Incident #102 was precisely about push delivery
numbers being decision-grade, and a push strategy for 1,041 unreachable
students is being decided on them. Corruptible telemetry is a product risk
even when it is not a data risk.

**Proposed hardening, not urgent.** Require the endpoint pair for the receipt
(not just the display half) so a notification id alone is insufficient; and
rate-limit the route. Both are changes to the Incident #102 beacon path and
should not be made casually — that beacon always landing is what the fix
depends on.

---

## Accepted risk — no Content-Security-Policy

Recorded in full, so "accepted risk" does not become a place things disappear.

- **Why absent.** `next.config.ts` ships HSTS, `X-Frame-Options: SAMEORIGIN`,
  `X-Content-Type-Options: nosniff` and `Referrer-Policy`, and states that CSP
  and `Permissions-Policy` are deliberately excluded.
- **What makes it hard here.** An enforced policy risks breaking the Razorpay
  checkout iframe (third-party scripts and frames on the one path that takes
  money) and microphone-based voice notes, plus inline styles.
- **Compensating controls.** Framing blocked by `X-Frame-Options`; MIME
  sniffing blocked; HSTS forces HTTPS; React escapes by default, and a Semgrep
  rule flags `dangerouslySetInnerHTML`.
- **Accepted by.** The founder, recorded in `next.config.ts`.
- **Reconsider when.** Any of: the checkout moves off an iframe; a
  report-only CSP can be run long enough to enumerate real sources; or the
  first XSS-class finding appears. **Report-Only mode is the cheap next step
  and breaks nothing.**

---

## What this review did NOT test

Route enumeration is not security testing, and the scope should not be read as
more than it is. These are residual, not cleared:

- **Payment state machine, adversarially.** Signatures, server-side amounts,
  activation idempotency and the refund→credit invariant were read and traced.
  What was *not* done: replay, races, duplicate callbacks, mismatched ids and
  hostile state transitions across
  `order → payment → credit → ownership → refund → reversal`. Incident #103
  was a latent defect in exactly this area, which is the argument for doing it.
- **Cross-user RLS matrix.** The IDOR sweep is static. The real boundary is
  *student A attempts every relevant read and write against student B's
  identifiers*, executed.
- **Admin authorization matrix.** Traced, not exercised. The gold standard is
  *authenticated non-admin → every admin route → expect 403/redirect*, then
  *admin → expect access*.
- **Push receipt abuse**, executed rather than reasoned.

Each is a bounded exercise. None is a reason to hold the current state.

---

## Traced and cleared

Recorded because a review listing only its findings cannot be distinguished
from a shallow one.

- **207 API routes enumerated.** Every `admin/*` route **authorises**, not
  merely authenticates. **Two of my own scans produced false positives** —
  first missing `isRequestAdmin()`, then missing the inline
  `me?.role !== 'admin'` check. Eight admin routes looked unguarded; all eight
  were correct. Both were my regex. **Static pattern matching is discovery
  tooling, not authorization analysis** — the same lesson as `is_admin`.
- **IDOR sweep.** 25 routes take an identity from the request *and* write; 24
  guarded. The 25th, `install/exchange`, is sound: 192-bit single-use token
  (`randomBytes(24)`), burned before any other work, expiry checked, and
  identity established by Supabase's own `setSession()` validation — the row's
  `user_id` only picks a redirect.
- **`user_role` cookie is a routing hint, not an authorization grant.** Read in
  a diagnostic log, a logged-out `/login` vs `/start` choice, and a
  post-authentication destination. `/admin/layout.tsx` calls `requireAdmin()`
  regardless, so a forged `user_role=admin` lands on `/admin` and is bounced.
- **Payments.** Both inbound paths verify signatures with `timingSafeEqual`.
  Amounts derive server-side; the browser sends a plan id, never an amount.
- **Database.** `anon` EXECUTE false on all 25 SECURITY DEFINER functions; 41
  functions carry a fixed `search_path`.
- **CI/CD.** No `pull_request_target`; no `${{ github.event.* }}` inside
  `run:`; third-party actions SHA-pinned; the Android signing keystore is
  **not** in the artifact upload and is removed with `if: always()`.
- **Secrets.** No literal credential in the working tree. Three history
  patterns traced to a prefix check, a comment and Semgrep's own rules — all
  false positives.
