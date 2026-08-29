'use client';

import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { supabaseUrl, supabaseAnonKey } from '@/lib/supabase/env';

// ── Singleton, not a factory ─────────────────────────────────────────────
//
// 16 Aug — root-caused a real student's ("worked today, logged out
// tomorrow") report to this file: every one of the 17 call sites
// (notification-bell, chat-thread, useLogging, etc.) used to get its OWN
// createBrowserClient() instance, each with its own in-memory refresh
// token and its own autoRefreshToken timer, all reading/writing the SAME
// session cookie with no coordination. Supabase's refresh tokens are
// single-use/rotating — when several of these independent clients wake up
// together (the common case: several components mount on the same page
// load right when the access token has expired, e.g. the first open after
// the PWA was backgrounded overnight), whichever one refreshes LAST is
// presenting an already-rotated, now-dead token. That request is rejected,
// nothing retries or listens for it (no onAuthStateChange anywhere in the
// app), and src/proxy.ts's middleware treats the rejection exactly like
// "never logged in" and silently redirects to /login.
//
// One client per page load — the pattern Supabase's own docs recommend —
// removes the race entirely: there is only ever one thing refreshing the
// session, so there is nothing left to race against.
let client: SupabaseClient | undefined;

export function createClient() {
  if (!client) {
    client = createBrowserClient(
      supabaseUrl(),
      supabaseAnonKey()
    );
  }
  return client;
}
