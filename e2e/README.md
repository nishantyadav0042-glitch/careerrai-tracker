# E2E smoke tests

The safety net that runs without an AI assistant. After any change:

```
npm run build          # catches type errors
npm run test:e2e       # drives the real funnel in a browser
```

Needs `.env.local` with at least:
```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

`playwright test` auto-starts `npm run start` and drives it. In this cloud
environment the browser binary is pre-installed — run with:
```
E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome npm run test:e2e
```
On your own machine or CI, run `npx playwright install chromium` once and drop
that env var.

## What's covered
- **smoke.spec.ts** — every public route returns a page (not a 500), and
  protected routes redirect logged-out visitors to /login. This is the class
  of failure that looked like a "blank card" before.
- **onboarding.spec.ts** — the /start funnel advances screen-to-screen to
  signup, and the CTA never sits below the fold (the buried-button and
  scroll-to-continue regressions).

No OTP is submitted and no payment is made — tests assert the FLOW, never
write real data.
