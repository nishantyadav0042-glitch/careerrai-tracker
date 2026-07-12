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

## Monitoring & alerting (in-app)
- **Audit trail:** security-relevant events are written to `public.security_events`
  (service-role only) via `src/lib/security-log.ts` — login lockouts, OTP-verify
  lockouts, payment activations/refunds, and unhandled server errors (captured by
  `src/instrumentation.ts` `onRequestError`).
- **Hourly anomaly monitor:** `/api/admin/security-monitor` (Vercel cron,
  `CRON_SECRET`-gated) aggregates the last hour and fires one alert if a threshold
  is crossed (credential-stuffing, OTP brute-force, error spikes, refund spikes,
  AI-quota abuse).
- **Alert delivery:** set `SECURITY_ALERT_WEBHOOK_URL` to a Slack/Discord webhook.
  Unset → alerts are logged to the server console (visible in Vercel logs).
- **Env (all optional, sane defaults):** `SECURITY_ALERT_WEBHOOK_URL`,
  `ALERT_LOGIN_LOCKOUTS` (10), `ALERT_OTP_LOCKOUTS` (10), `ALERT_SERVER_ERRORS`
  (25), `ALERT_REFUND_REQUESTS` (5), `ALERT_AI_CALLS` (500) — per rolling hour.
- **Error tracking:** `onRequestError` centralizes server errors today; to add
  Sentry/Datadog, forward `(err, request, context)` from there (gated on a DSN).

## Operational hardening owned outside the codebase (verify in dashboards)
- Supabase Auth → enable **leaked-password protection**; confirm OTP expiry +
  verify rate-limits.
- Confirm Supabase **PITR / backup** schedule for your plan.
- Add error-tracking/APM + alerting (auth failures, payment errors, AI spend).
- Consider a **CSP** (currently omitted) once inline-style/script usage is audited.

## Reporting
Email security concerns to the maintainers; do not open public issues for
suspected vulnerabilities.
