# CareerRai — Setup: Phone-OTP Auth + Payments

This covers the founder prerequisites for the phone-OTP login and the three
payment flows. Code reads everything from env vars, so nothing ships until you
complete these external setups. **Beta default: payments are OFF.**

---

## 1. Environment variables

Add these in Vercel (Project → Settings → Environment Variables). Never expose
secret keys to the client — only the `NEXT_PUBLIC_*` vars are safe in the browser.

| Variable | Where | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | client + server | Supabase project URL (already set) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client + server | Supabase anon key (already set) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Admin operations (already set) |
| `MSG91_AUTH_KEY` | server only | MSG91 API auth key |
| `MSG91_OTP_TEMPLATE_ID` | server only | DLT-approved OTP template id |
| `MSG91_SENDER_ID` | server only | DLT-registered sender id |
| `SEND_SMS_HOOK_SECRET` | server only | Secret from the Supabase Send-SMS hook (`v1,whsec_…`) |
| `RAZORPAY_KEY_ID` | server only* | Razorpay key id (*also returned to client for checkout) |
| `RAZORPAY_KEY_SECRET` | server only | Razorpay secret — order creation |
| `RAZORPAY_WEBHOOK_SECRET` | server only | Razorpay webhook signature secret |
| `NEXT_PUBLIC_PAYMENTS_ENABLED` | client + server | `true` to show the payment UI. **Leave `false` for beta.** |

---

## 2. Database migration

Apply `supabase/migrations/20260613_auth_and_payments.sql` in the Supabase SQL
Editor (paste → run). It is idempotent. Adds: `student_allowlist`,
`otp_send_events`, `student_payments`, `buddy_payouts`, subscription columns +
`agreed_monthly_payout` on `profiles`, and RLS.

---

## 3. Phone OTP (MSG91 + Supabase)

**Order matters — DLT has a multi-day lead time. Start it first.**

1. **DLT registration (slow — do this first):** Register your entity on a DLT
   portal, get a sender id, and submit an OTP SMS template whose body has one
   variable for the code (e.g. `Your CareerRai code is {#var#}. Valid 5 min.`).
   Approval takes a few days.
2. **MSG91 account:** Create an account, grab the **Auth Key**, link your
   DLT sender + template, note the **Template ID**. Set `MSG91_AUTH_KEY`,
   `MSG91_OTP_TEMPLATE_ID`, `MSG91_SENDER_ID`.
3. **Supabase phone provider:** Dashboard → Authentication → Providers → enable
   **Phone**. (We deliver via the hook below, so the built-in provider only needs
   to be on.)
4. **Supabase Send-SMS hook:** Dashboard → Authentication → Hooks → **Send SMS** →
   set the URL to `https://<your-domain>/api/auth/sms-hook`, copy the generated
   secret into `SEND_SMS_HOOK_SECRET`. Supabase generates/verifies the code; our
   hook hands it to MSG91 for delivery.

Students never get a password. Only numbers the founder adds to the allowlist
(Admin → Student access) can request a code.

---

## 4. Payments (Razorpay)

1. **Razorpay account:** Get `RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` (test mode
   first).
2. **Webhook:** Dashboard → Settings → Webhooks → add
   `https://<your-domain>/api/payments/webhook`, subscribe to `payment.captured`
   (and optionally `order.paid`), set a secret → `RAZORPAY_WEBHOOK_SECRET`.
3. **Refunds are manual.** A student's "Request refund" only flags admin; you
   refund in the Razorpay dashboard, then update their status. Nothing automated.
4. **Buddy payouts are manual.** The app only tracks what's owed and what you've
   marked paid. Pay buddies via UPI/bank yourself and paste the reference.

Keep `NEXT_PUBLIC_PAYMENTS_ENABLED=false` through beta. The first students are
free — you're buying their honest behavior, not their ₹999.

---

## 5. Manual test checklist

Seed one student (add their number in Admin → Student access) and one buddy.

### Auth
- [ ] Number NOT on allowlist → "isn't registered yet" message, no SMS.
- [ ] Number on allowlist → SMS arrives, code verifies, lands on `/student/tracker`.
- [ ] Requesting > 3 codes in 30 min → rate-limited; < 30s apart → cooldown.
- [ ] Buddy/admin still log in with username + password (staff tab).
- [ ] Posting to `/api/auth/sms-hook` with a bad signature → 401.

### Payments OFF (`NEXT_PUBLIC_PAYMENTS_ENABLED=false`)
- [ ] No "Membership" card on the student Profile.
- [ ] `POST /api/payments/create-order` → 403.

### Payments ON (`NEXT_PUBLIC_PAYMENTS_ENABLED=true`)
- [ ] Membership card shows "Free beta"; plans render in Profile only (never at login).
- [ ] Upgrade → Razorpay checkout opens; test payment → webhook flips status to
      "Active" with a renewal date; appears in Admin → Payments → Incoming.
- [ ] "Request refund" → status "Refund requested" + admin gets a notification.
- [ ] Webhook with a bad signature → 401, no status change.

### Buddy payouts (admin-tracked, manual-pay)
- [ ] Admin → Payments → Outgoing: set a buddy's agreed payout.
- [ ] "Mark as paid" with a UPI ref → recorded; buddy's Earnings shows Paid + ref.
- [ ] Buddy sees ONLY their own amount, can't edit it or mark themselves paid.
- [ ] "Mark as paid" is blocked until an agreed amount is set.
