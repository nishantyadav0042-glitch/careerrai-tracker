import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { COMPANION_SLOTS, RETIRED_COMPANION_SLOTS, type CompanionSlot } from './companion';

// ── ONE CANONICAL COMPANION SCHEDULE ────────────────────────────────────────
//
// On 1 Sep 2026 a morning announcement was written against the `morning`
// slot. `morning` has copy, a `case` in the cron route, and membership in
// PLAN_SLOTS and needsCoverage — everything that makes a slot look alive.
// It has no line in vercel.json, so it had not fired since 27 July. The
// announcement would have gone to nobody, silently.
//
// Nothing caught it, and nothing could have:
//   · cron_runs only records handlers that actually execute, so an
//     unscheduled slot leaves no trace to miss.
//   · findSilentCrons (cron-liveness.ts) deliberately keys on the ROUTE —
//     study-companion is one deployment declared four times — so the four
//     live slots prove the route alive and mask any absent fifth.
//   · the notification-health page charts types that HAVE rows.
//
// So the check has to be static, and this is it. Every declared slot is
// scheduled or explicitly retired, exactly one of the two. Retiring a slot
// is then a deliberate edit to RETIRED_COMPANION_SLOTS, and scheduling one
// is a deliberate edit to vercel.json — neither can happen by omission.
//
// Evidence for the current split is in the RETIRED_COMPANION_SLOTS comment:
// five slots' notification rows stop on 27 July while four continue to
// today, landing on exactly BUDGET_ACTIVE = 4.

const vercel = JSON.parse(readFileSync('vercel.json', 'utf8')) as {
  crons?: Array<{ path: string; schedule: string }>;
};

const scheduled = (vercel.crons ?? [])
  .filter((c) => c.path.split('?')[0] === '/api/cron/study-companion')
  .map((c) => new URLSearchParams(c.path.split('?')[1] ?? '').get('slot'))
  .filter((s): s is string => s !== null);

describe('the companion schedule is canonical', () => {
  it('vercel.json declares companion slots at all (the list is not silently empty)', () => {
    expect(scheduled.length).toBeGreaterThan(0);
  });

  it('every scheduled slot is a real slot', () => {
    for (const s of scheduled) {
      expect(COMPANION_SLOTS, `vercel.json schedules '${s}', which is not a CompanionSlot`)
        .toContain(s as CompanionSlot);
    }
  });

  it('no slot is both scheduled and retired', () => {
    const both = scheduled.filter((s) => RETIRED_COMPANION_SLOTS.includes(s as CompanionSlot));
    expect(both, `scheduled in vercel.json but listed as retired: ${both.join(', ')}`).toEqual([]);
  });

  it.each(COMPANION_SLOTS)(
    "'%s' is either scheduled in vercel.json or listed in RETIRED_COMPANION_SLOTS",
    (slot) => {
      const isScheduled = scheduled.includes(slot);
      const isRetired = RETIRED_COMPANION_SLOTS.includes(slot);
      expect(
        isScheduled || isRetired,
        `Slot '${slot}' has copy and a route branch but no schedule and no retirement. ` +
        `That is the 1 Sep 2026 defect: it looks alive and sends to nobody. ` +
        `Either add a vercel.json cron for it, or add it to RETIRED_COMPANION_SLOTS ` +
        `with the production evidence that it was retired on purpose.`,
      ).toBe(true);
    },
  );

  it('the live slot count does not exceed BUDGET_ACTIVE', async () => {
    // A fifth live slot would be built and dispatched every day and then
    // refused as `budget_exhausted` for exactly the engaged loggers the
    // cadence is for. If the budget rises, this reads the new number.
    const { BUDGET_ACTIVE } = await import('./notification-os');
    expect(new Set(scheduled).size).toBeLessThanOrEqual(BUDGET_ACTIVE);
  });
});
