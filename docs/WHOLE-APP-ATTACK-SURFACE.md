# CareerRai — externally reachable attack surface

**23 Aug 2026 · READ-ONLY.** 180 API routes, 98 pages, 87 tables enumerated.
No route was called; every classification is **STATICALLY ASSESSED — NOT
EXPLOITED** unless production data independently proves the behaviour.

---

# 1. UNAUTHENTICATED SURFACE — 15 routes

Enumerated mechanically: every `route.ts` carrying none of
`getAuthUser | auth.getUser | auth.getSession | requireAdmin | requireSales |
requireBuddy | isRequestAdmin | authorizedCron | *_SECRET | X-API-Key |
createHmac | signature`.

| Route | Purpose | Writes? | Bound | Assessment |
|---|---|---|---|---|
| `/api/auth/login` | credential → session | yes | `login_attempts` (187 rows) | **PROVEN — pre-auth by definition** |
| `/api/auth/logout` | clear session | — | — | PROVEN. *Known issue: global signOut scope (task #43)* |
| `/api/auth/request-otp` | email OTP | yes | rate-limited | PROVEN |
| `/api/auth/request-phone-otp` | phone OTP | yes | **`claim_otp_send_slot(phone, ip)` — atomic slot claim, `SECURITY DEFINER`, pinned search_path** | **PROVEN BOUNDED** |
| `/api/auth/verify-otp` | verify | yes | — | PROVEN |
| `/api/auth/verify-phone-otp` | verify + create profile | yes | — | PROVEN |
| `/api/cat-leads` | public quiz capture | yes | 10/IP/day + 24h phone dedup, fails open on unknown IP | **PROVEN BOUNDED** |
| `/api/funnel` | anonymous funnel beacon | yes | per-anon cap | **P3** — see §4 |
| `/api/install/exchange` | consume handoff token | yes | single-use, 15-min TTL | **P2** — see §3 |
| `/api/install/handoff` | mint handoff token | yes | *authenticated via `auth.getSession()` — my grep missed it* | **P3** — see §3 |
| `/api/push/app-open` | notification telemetry | **UPDATE** | uuid-keyed | **P3** — see §2 |
| `/api/push/click` | notification telemetry | **UPDATE** | uuid-keyed | **P3** — see §2 |
| `/api/push/received` | notification telemetry | **UPDATE ×2** | uuid-keyed | **P2** — see §2 |
| `/api/push/vapid-public-key` | public key | no | — | PROVEN — public by design |
| `/api/version` | build version | no | — | PROVEN |

**11 of these 15 use `createAdminClient()`** (service-role, bypasses RLS). That
is correct for auth and telemetry, and it means the route body is the entire
authorization boundary for each.

---

# 2. ANONYMOUS MUTATION OF ANOTHER USER'S RECORDS

`/api/push/{click,received,app-open}` accept `{ id }` from an unauthenticated
body and `UPDATE notifications` on it. `/api/push/received` additionally writes
`profiles.push_verified_at` for that notification's owner.

* **Precondition:** knowing a notification id.
* **Evidence:** `notifications.id` is `uuid` (confirmed from
  `information_schema`) — 122 bits of entropy, not enumerable.
* **Impact if known:** corrupt delivery analytics for one student; falsely mark
  their push as verified, which feeds notification-health decisions.
* **Severity: P3** (P2 for `received`, which touches `profiles`).
  **STATICALLY ASSESSED — NOT EXPLOITED.**
* **Fix:** bind the update to the notification's own user via a signed token,
  or accept and document the risk. The uuid is the only control today.

---

# 3. THE PWA SESSION HANDOFF — the most sensitive surface in the app

```
POST /api/install/handoff   (authenticated via auth.getSession())
  → 24 random bytes (192 bits) token
  → AES-256-GCM(access_token + refresh_token)
  → row in pwa_session_handoff, 15-min TTL
  → returns /app?k=<token>

POST /api/install/exchange  (unauthenticated, by design)
  → look up token → reject if used or expired
  → mark used → decrypt → supabase.auth.setSession() → httpOnly cookies
```

**Assessed strengths:** 192-bit token (not guessable) · single-use · 15-minute
TTL · tokens never reach client JS · AES-256-GCM is authenticated encryption so
a tampered payload fails closed · `Referrer-Policy:
strict-origin-when-cross-origin` stops the `?k=` value leaking cross-origin ·
`REVOKE INSERT/UPDATE/DELETE … FROM anon, authenticated` on the table.

**Three real weaknesses:**

| | Finding | Severity |
|---|---|---|
| **3a** | **No retention.** 502 rows, all with payload, oldest 12 July, **0 live, 494 expired-unused, 8 used**. No purge job exists in the repo. Each row holds an encrypted access+refresh pair | **P1** |
| **3b** | **The encryption key is `sha256(SUPABASE_SERVICE_ROLE_KEY)`** — the same secret that already grants full DB access. Encryption defends against a DB-only leak (backup/replica), **not** against service-role compromise | **P2 — by design, but the design should be stated, not assumed** |
| **3c** | **Burn is not atomic.** `select … then update({used:true})` is a read-then-write; two concurrent exchanges can both observe `used=false`. Impact is bounded (both establish the *same* session for the *same* user) | **P3** |

Also noted: **`handoff` uses `auth.getSession()`, not `auth.getUser()`.**
`getSession()` reads the cookie without re-verifying the JWT against the auth
server. A forged cookie would mint a row containing forged tokens, which then
fail at `setSession` — so it is not an escalation, but it is the weaker of the
two calls on the most sensitive route. **P3.**

**Usage reality: 8 consumed of 502 minted (1.6%).** The feature is essentially
unused, which makes 3a a pure liability with no offsetting benefit.

---

# 4. ANONYMOUS TELEMETRY WRITE

`/api/funnel` accepts `{ anon, step }` and inserts into `funnel_events`
(14,083 rows). `anon` is caller-supplied and truncated to 64 chars.

* **Impact:** funnel metrics can be inflated by anyone. Since `funnel_events`
  is **0% identity-bearing** it cannot be used to attack a user — only to
  distort `/admin/funnel` and `/admin/growth`.
* **Severity: P3.** A per-anon cap exists.
* **Consequence for the Control Tower:** any pre-signup funnel number is
  **attacker-influenceable** and must be labelled as such rather than presented
  as fact.

---

# 5. WEBHOOK SURFACE

| Vendor | Auth | Replay protection | Identity correlation | Verdict |
|---|---|---|---|---|
| **Razorpay** | HMAC-SHA256 over the raw body, verified **before** any state change; missing secret ⇒ event dropped with a 200 so retries stop | order/payment id | `razorpay_order_id` → our row | **PROVEN SOUND.** A failed read throws → 500 → redelivery, never a false ack |
| **Expedify `/outcome`** | shared secret, accepted as **`?key=` in the query string** or a header | `dedupe_key UNIQUE` — **NULL on 239/239 rows, so inert** | **phone → first match** | **PROVEN VULNERABLE** (P1-D) |
| **Expedify `/callback`** | shared secret, header only | none | phone → first match | **PROVEN VULNERABLE**, 0 events ever received |

**Query-string secret (P2):** `?key=<secret>` lands in access logs, proxy logs
and browser history. A header is already accepted; the query form should not be.

---

# 6. AUTHENTICATED SURFACE — role boundaries

| From → To | Result | Evidence |
|---|---|---|
| Student → another student | **BLOCKED** | `profiles` RLS is self-only; every student route resolves `user.id` server-side |
| Student → admin object | **BLOCKED** | `requireAdmin` reads role server-side and *throws* on an unreadable read rather than redirecting |
| Buddy → another buddy's student | **BLOCKED** | `/api/buddy/briefing/[studentId]` enforces `student.buddy_id === user.id` → 403 |
| Chat participant → another thread | **BLOCKED** | participant check, **404 not 403** so existence is not confirmed |
| **Rep → any student** | **OPEN (P1-C)** | `/sales/student/[id]`: `requireSales()` then raw URL id |
| **Rep → claim any person** | **OPEN (P1-B)** | `/api/sales/log`: `typeof studentId === 'string'` only |
| Rep → another rep's ownership | **BLOCKED** | `claim_lead` refuses an owned lead; reassign is admin-only |
| Anonymous → any protected object | **BLOCKED** | 87/87 tables RLS-on; client write grants revoked |

**Structural note:** `profiles` carries six RLS policies — admin-all,
buddy-reads-their-students, and four self-only. **There is no `sales` policy.**
A rep's browser can read only her own row; everything she sees arrives through
server components using service-role. So the sales findings above are
*unmitigated by any second layer* — route code is the only control.

---

# 7. CLIENT-SIDE AND TRANSPORT

| | State |
|---|---|
| Security headers | HSTS (1y, includeSubDomains) · X-Frame-Options SAMEORIGIN · X-Content-Type-Options nosniff · Referrer-Policy strict-origin-when-cross-origin |
| **CSP** | **ABSENT — deliberate**, documented in `next.config.ts` as avoiding breakage of the Razorpay iframe, voice notes and inline styles |
| **Permissions-Policy** | **ABSENT — same rationale** |
| XSS sinks | **one**, a static constant with no interpolation |
| Public env | 11 `NEXT_PUBLIC_*`, all public by design; **no server secret among them** |
| Secrets in repo | 0 tracked `.env`; `.env*` gitignored; the two setup scripts contain **placeholders**, not keys (see audit correction 7) |
| Dependencies | 16 runtime, 11 dev, lockfile present. `web-push` marked `serverExternalPackages` so it is never bundled client-side |

**CSP absence is the single largest unclosed web-layer control.** With one
static XSS sink and no user-controlled HTML rendering, its practical value
today is low — but it is the layer that would contain a future mistake, and its
absence should be a decision that is re-taken rather than inherited.

---

# 8. COST / DOS SURFACE

| Endpoint | Cost per call | Limit | Assessment |
|---|---|---|---|
| `/api/auth/request-phone-otp` | SMS (real money) | **`claim_otp_send_slot` — atomic, per phone + IP** | **PROVEN BOUNDED** — the best-protected public endpoint |
| `/api/cat-leads` | DB write | 10/IP/day | BOUNDED |
| `/api/parse-scorecard` | **Gemini call** | rate-limit present | authenticated |
| `/api/chat/draft`, `/api/feedback-draft` | **Gemini call** | rate-limit present | authenticated |
| `/api/funnel` | DB write | per-anon cap | P3, unauthenticated |
| `/api/push/*` | DB update | **none** | uuid is the only gate |
| `/api/client-error` | DB write | rate-limit present | 221 rows |

**No unauthenticated endpoint reaches a paid AI call.** That is the property
that matters most for cost abuse, and it holds.
