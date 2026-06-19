# Fix: Email OTP sends a link instead of a 6-digit code

## What's wrong

Supabase is sending its default "Confirm your email address" email (which has a click-link)
instead of a 6-digit OTP code. The app code is already correct — it calls `signInWithOtp`
and verifies with `verifyOtp(type: 'email')`. The fix is entirely in the Supabase dashboard:
the email templates need to use `{{ .Token }}` (the 6-digit code) instead of
`{{ .ConfirmationURL }}` (the click-link).

---

## Required dashboard change (do this once)

**Go to:** Supabase Dashboard → Authentication → Email Templates

You need to edit **two** templates: **"Confirm signup"** and **"Magic Link"**.

Supabase sends "Confirm signup" for a user's first-ever login, and "Magic Link" for
returning users. Both must show the 6-digit code.

---

### Template 1 — "Confirm signup"

**Subject:**
```
Your CareerRai login code
```

**Body (HTML):**
```html
<h2>Your CareerRai login code</h2>
<p>Enter this code to log in:</p>
<h1 style="letter-spacing: 8px; font-size: 36px;">{{ .Token }}</h1>
<p>Valid for 60 minutes. If you didn't request this, ignore this email.</p>
```

> `{{ .Token }}` is the Supabase variable that renders the 6-digit OTP.
> Do NOT use `{{ .ConfirmationURL }}` — that renders a click-link, not a code.

---

### Template 2 — "Magic Link"

Same change:

**Subject:**
```
Your CareerRai login code
```

**Body (HTML):**
```html
<h2>Your CareerRai login code</h2>
<p>Enter this code to log in:</p>
<h1 style="letter-spacing: 8px; font-size: 36px;">{{ .Token }}</h1>
<p>Valid for 60 minutes. If you didn't request this, ignore this email.</p>
```

---

## Optional — check Email provider settings

Supabase Dashboard → Authentication → Providers → Email:

- "Confirm email" can be ON or OFF — either works with this setup because the OTP
  verification itself acts as confirmation.
- "Secure email change" — leave as-is.
- You do NOT need a custom SMTP for this to work; Supabase's built-in provider
  sends the code once the template is set correctly.

---

## After making the template change

Test by going to `/login` → click "Login with OTP" → enter an allowlisted email.
You should now receive an email with a 6-digit code (not a "Confirm email address" link).
Enter the code in the app → logs in and routes to the right dashboard.

---

## Why this is the only fix needed

The app code (`/api/auth/request-otp` and `/api/auth/verify-otp`) already uses the correct
Supabase OTP token flow:

```ts
// request-otp — sends the email
await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });

// verify-otp — validates the 6-digit code the user types
await supabase.auth.verifyOtp({ email, token, type: 'email' });
```

The login UI already has a 6-digit code entry box. Everything is wired correctly.
The ONLY missing piece is the `{{ .Token }}` variable in the Supabase email templates.
