# Security

Security is part of the development process, not a one-time audit.

## Automated scanning (CI)
`.github/workflows/security.yml` runs on every PR, every push to `main`, and
weekly:
- **Semgrep** — SAST (OWASP Top Ten, security-audit, secrets, Next.js rules)
- **Gitleaks** — committed-secret scan across full git history
- **Trivy** — dependency CVEs, secrets, and misconfigurations (HIGH/CRITICAL)
- **npm audit** — production dependency advisories (fails on HIGH/CRITICAL)

Run SAST locally (offline ruleset): `semgrep --config .semgrep/local-rules.yaml src/`

## Architectural invariants (do not regress)
- **All privileged DB writes go through the service-role client.** Client
  (anon/authenticated) access is governed by RLS. Never expose the service-role
  key to the client or a `NEXT_PUBLIC_` var.
- **`profiles` privileged columns** (`role`, `is_premium`, `subscription_*`,
  `buddy_id`, `password_set`, …) are protected by the
  `guard_privileged_profile_columns` trigger — the last line of defense against
  self-escalation. Keep it.
- **Payments change state only from the HMAC-verified Razorpay webhook.** Never
  trust a client "payment success". Price is always server-computed.
- **SECURITY DEFINER / state-changing RPCs** must have `EXECUTE` revoked from
  `public`/`anon`/`authenticated` (service-role only), unless an RLS policy
  requires it (e.g. `is_admin` for `authenticated`).
- **AI routes** receive only server-computed facts or fenced user data, are
  ownership-scoped, per-user rate-limited, and never render model output as HTML.

## Periodic review (recommended cadence)
- **Each PR:** CI scans above; review any new RLS policy or `EXECUTE` grant.
- **Monthly:** re-run `get_advisors` (security + performance); review
  service-role usage and storage-bucket policies.
- **Before scaling / handling more sensitive data:** commission an external
  penetration test and enable alerting on anomalous auth, payment, and AI usage.

## Operational hardening owned outside the codebase (verify in dashboards)
- Supabase Auth → enable **leaked-password protection**; confirm OTP expiry +
  verify rate-limits.
- Confirm Supabase **PITR / backup** schedule for your plan.
- Add error-tracking/APM + alerting (auth failures, payment errors, AI spend).
- Consider a **CSP** (currently omitted) once inline-style/script usage is audited.

## Reporting
Email security concerns to the maintainers; do not open public issues for
suspected vulnerabilities.
