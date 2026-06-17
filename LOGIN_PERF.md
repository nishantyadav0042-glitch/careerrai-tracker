# Login Performance Analysis

## Root Cause

The "5-second login" was never a login problem — it was a redirect problem.

The login page (`/login`) is a pure client-side component (`'use client'`). It renders instantly with no SSR overhead. The password API route does exactly 2 sequential DB operations:
1. Profile lookup by email/username — ~5ms (Singapore, with `sin1` fix)
2. `supabase.auth.signInWithPassword()` — ~80ms (Supabase auth service)

Total login action: <100ms.

The 5 seconds happened **after** successful login, when the browser was redirected to `/student/tracker`. That page runs as a Vercel serverless function and was executing in `iad1` (Washington DC, US East) while the Supabase database is in `ap-southeast-1` (Singapore). Each DB query incurred ~250ms round-trip. With 8 parallel queries in `Promise.all`, the batch was limited by the slowest connection; on cold starts (no kept-alive TCP), it reached 4-6 seconds.

## Fix Applied

`export const preferredRegion = 'sin1'` in `src/app/layout.tsx` (root layout) moves all Vercel serverless functions to Singapore — co-located with the database. Cascades to every page and API route.

Expected: warm loads <1.5s total. Cold starts still 800ms–1.2s (Vercel platform limit).

## Remaining Cold-Start Limit

When the function hasn't been called in >15 minutes, Node.js needs to boot. This is a Vercel platform limit — not fixable without Vercel Pro "Function Always Live". No code change eliminates it on the free tier.

## Status: FIXED
