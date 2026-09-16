import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { codeOnly } from '@/lib/test-support/code-only';

// ── EVERY DOOR THAT WRITES A STUDIED DAY MUST SAY SO ────────────────────────
//
// `daily_reports` is written through `upsert_log_and_streak` from TWO places:
//
//   1. useLogging.ts          → /api/logging/log-daily      (the log sheet)
//   2. TodaysRoutineCard.tsx  → /api/routine/complete-task  (the plan card)
//
// Only (1) emitted `daily_log`. (2) is the door students actually use, so the
// event counted a fraction of reality — measured 16 Sep 2026 across nine days:
// 2 events against 30 real rows on 14 Sep, 3 against 23 on 13 Sep. Roughly
// 12-20% captured.
//
// This was not a reporting nuisance. Every retention curve, cohort split and
// experiment readout is computed from this event, so the undercount put a
// wrong denominator under every decision taken from it — and it survived nine
// days precisely because the number it produced looked plausible.
//
// The failure mode is silent and repeatable: add a third writer of
// daily_reports, forget the event, and the next audit is wrong again with no
// error anywhere. These tests make the omission fail the build instead.

const ROUTE = join(process.cwd(), 'src/app/api/routine/complete-task/route.ts');
const CARD = join(process.cwd(), 'src/components/DailyTracker/TodaysRoutineCard.tsx');
const HOOK = join(process.cwd(), 'src/hooks/useLogging.ts');

const src = (p: string) => codeOnly(readFileSync(p, 'utf8'));

describe('daily_log is emitted by every path that writes daily_reports', () => {
  it('the plan card emits daily_log', () => {
    expect(src(CARD), 'TodaysRoutineCard writes daily_reports via close_day and must emit daily_log')
      .toMatch(/track\(\s*['"]daily_log['"]/);
  });

  it('the log sheet still emits daily_log', () => {
    expect(src(HOOK)).toMatch(/track\(\s*['"]daily_log['"]/);
  });

  it('both callers tag which door the day came through', () => {
    // Without `surface` the two paths collapse into one untraceable total,
    // which is the condition that let the undercount hide.
    expect(src(CARD)).toMatch(/surface:\s*['"]plan_card['"]/);
    expect(src(HOOK)).toMatch(/surface:\s*['"]log_sheet['"]/);
  });
});

describe('the plan card counts a studied day ONCE', () => {
  it('gates daily_log on isNewLog, never on dayClosed alone', () => {
    const code = src(CARD);
    // `close_day` rides along on every tick, so dayClosed stays true for the
    // second and tenth tap of an already-closed day. Gating on it would count
    // one studied day several times — an overcount is worse than the
    // undercount it replaces, because it looks like growth.
    const guard = /if\s*\(\s*json\.isNewLog\s*\)\s*\{\s*track\(\s*['"]daily_log['"]/;
    expect(code, 'daily_log must be emitted only when the server says a row was inserted')
      .toMatch(guard);
    expect(code, 'daily_log must not be gated on dayClosed')
      .not.toMatch(/if\s*\(\s*json\.dayClosed\s*\)\s*\{\s*track\(\s*['"]daily_log['"]/);
  });
});

describe('the server tells the client whether it actually inserted', () => {
  const code = () => src(ROUTE);

  it('reads is_new_log off the RPC result', () => {
    // The RPC is the only thing that knows which call inserted. log-daily
    // already reads this field; complete-task must read the same one rather
    // than inventing a second definition of "a new studied day".
    expect(code()).toMatch(/is_new_log/);
    expect(code(), 'the RPC result must be captured, not discarded')
      .toMatch(/data:\s*rpcResult/);
  });

  it('returns isNewLog to the client', () => {
    expect(code()).toMatch(/\bisNewLog\b/);
  });

  it('defaults isNewLog to false when the RPC errored or returned an odd shape', () => {
    // A missed event is a visible undercount someone can chase. A phantom one
    // silently inflates the number the company steers by, and nothing catches
    // it — so the unknown case must resolve to false.
    expect(code()).toMatch(/isNewLog\s*=\s*!rpcError\s*&&/);
    expect(code()).toMatch(/is_new_log\s*===\s*true/);
  });

  it('captures the RPC result on the RETRY too', () => {
    // The route retries the upsert once. If the retry only re-binds `error`,
    // a day closed on the second attempt reports isNewLog:false and goes
    // uncounted — reintroducing the same undercount through the back door.
    // The retry is a parenthesised re-assignment, distinct from the initial
    // `let` binding. Match that exact form so the test reads the retry and not
    // the first call.
    expect(code(), 'the retry must re-bind rpcResult, not just rpcError')
      .toMatch(/\(\s*\{\s*data:\s*rpcResult\s*,\s*error:\s*rpcError\s*\}\s*=\s*await\s+admin\.rpc/);
  });
});
