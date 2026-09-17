import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '@/lib/test-support/code-only';

// ── A student never reads a driver's error message ──────────────────────────
//
// This flow has now put an engineer's string on a student's screen twice:
//
//   Incident #14   "permission denied for function is_admin"   (Postgres)
//   13 Sep 2026    "TypeError: Load failed"                    (iOS Safari)
//
// Both on the Blueprint Builder, the flow that decides whether somebody ever
// becomes a student at all. The second one reached the last screen — a student
// choosing his finish date — and we only heard about it because a counsellor
// forwarded a screenshot from WhatsApp.
//
// The shape is always the same: `setError(someError.message)`. It looks like
// helpfulness and it is the opposite. These tests make the regression
// structurally impossible rather than trusting the next person to remember.

const MODAL = join(process.cwd(), 'src/app/student/onboarding/onboarding-modal.tsx');
const src = () => codeOnly(readFileSync(MODAL, 'utf8'));

describe('the Blueprint Builder never renders a raw error to a student', () => {
  it('never passes a caught error\'s .message into setError', () => {
    const code = src();
    // Catches `setError(message)` where message came off the error, plus the
    // direct `setError(err.message)` / `setError(e?.message ?? '…')` forms.
    const leaks = [
      /setError\s*\(\s*[A-Za-z_$][\w$]*\s*\.\s*message/,
      /setError\s*\(\s*\(?\s*[A-Za-z_$][\w$]*\s+as\s+[^)]*\)?\s*\??\.\s*message/,
      /setError\s*\(\s*message\b/,
      /setError\s*\(\s*errorText\s*\(/,
    ];
    for (const re of leaks) {
      expect(code, `setError must never receive a driver message (matched ${re})`).not.toMatch(re);
    }
  });

  it('still REPORTS the real error — the fix must not make us blind', () => {
    // The whole point of report-error.ts. Hiding the message from the student
    // is correct; hiding it from us is how Incident #14 stayed invisible.
    const code = src();
    expect(code).toMatch(/reportHandledError\s*\(/);
    expect(code).toMatch(/onboarding:blueprint-save/);
  });

  it('routes saves through the retrying writer, not bare .update() calls', () => {
    const code = src();
    // The step marker at the top of handleNext is deliberately fire-and-forget
    // (lead telemetry must never block a student), so it is allowed to stand
    // alone. Every save the student is WAITING on goes through saveProfile.
    const bareAwaitedUpdates = code.match(/await\s+supabase\s*\.\s*from\(\s*'profiles'\s*\)\s*\.\s*update/g) ?? [];
    expect(bareAwaitedUpdates, 'awaited profile writes must go through saveProfile()').toHaveLength(0);
    expect(code).toMatch(/retryOnNetworkFailure\s*\(/);
  });

  it('tells the student their answers survived', () => {
    // A student who believes the work is gone closes the tab. Both branches
    // of the catch must say otherwise.
    const raw = readFileSync(MODAL, 'utf8');
    // No `s` flag — [^;] already spans newlines, and the flag needs es2018.
    const setErrorCalls = raw.match(/setError\(\s*(?:\(|")[^;]*?\);/g) ?? [];
    const humanBranches = setErrorCalls.filter((c) => /saved/i.test(c) || /NETWORK_WRITE_MESSAGE/.test(c));
    expect(humanBranches.length, 'the catch should reassure the student their answers are kept').toBeGreaterThan(0);
  });
});
