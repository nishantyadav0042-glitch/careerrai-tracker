// ── Mock scores steer the plan (founder, 13 Aug) ────────────────────────────
//
// "Is it connected to the performance of students? If not then add it —
// mock score performance is significantly important."
//
// It was not connected. The plan's weak-section chain read self-report →
// onboarding baseline → coverage grid, so a student who said "DILR is weak"
// in June kept a DILR-first plan while every mock since showed VARC bleeding.
// The single most expensive signal a student gives us — three hours plus
// percentiles — changed nothing about their next morning.
//
// Now a recent, complete mock debrief OUTRANKS the self-report: measured
// evidence beats remembered feeling. Everything else about the chain stays;
// this only inserts one link at the top, and only when it has earned it:
//
//   · COMPLETE — all three section percentiles present. A mock with one
//     section filled ranks nothing.
//   · RECENT — within 45 days. CAT prep moves fast; June's mock is not
//     evidence about September's weaknesses.
//   · DECISIVE — the gap between the weakest and next section is at least
//     MIN_GAP percentile points. 89/90/91 is noise; steering the whole plan
//     on it would swap the focus every mock.
//
// Ties and near-ties fall back to the rest of the chain unchanged. And the
// override is SAID, never silent (`basis` renders on the plan): a plan that
// quietly contradicts what the student typed reads as a broken app, not as
// coaching — the same rule as todayBudget's reason line.

export type Section = 'VARC' | 'DILR' | 'QA';

export interface DebriefRow {
  taken_on: string;
  varc: { percentile?: number | null } | null;
  dilr: { percentile?: number | null } | null;
  qa: { percentile?: number | null } | null;
}

export interface MockFocus {
  weakest: Section;
  strongest: Section;
  /** Shown to the student — the plan must say WHY its focus moved. */
  basis: string;
  takenOn: string;
}

/** Older mocks than this say nothing about who the student is now. */
export const MAX_DEBRIEF_AGE_DAYS = 45;
/** Below this gap between weakest and next, the mock decides nothing. */
export const MIN_GAP = 3;

function pct(v: { percentile?: number | null } | null): number | null {
  const n = Number(v?.percentile);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

/**
 * The most recent debrief that has earned the right to steer the plan, or
 * null — in which case the existing chain (self-report → baseline →
 * coverage) decides exactly as before.
 *
 * `debriefs` newest-first, as the DB query returns them.
 */
export function mockInformedFocus(debriefs: readonly DebriefRow[], today: string): MockFocus | null {
  const cutoff = new Date(new Date(`${today}T00:00:00Z`).getTime() - MAX_DEBRIEF_AGE_DAYS * 86_400_000)
    .toISOString().slice(0, 10);

  for (const d of debriefs) {
    if (!d.taken_on || d.taken_on < cutoff || d.taken_on > today) continue;
    const scores: { s: Section; v: number | null }[] = [
      { s: 'VARC', v: pct(d.varc) },
      { s: 'DILR', v: pct(d.dilr) },
      { s: 'QA', v: pct(d.qa) },
    ];
    // Incomplete mocks are skipped, not disqualifying — an older complete
    // one may still be within the window.
    if (scores.some((x) => x.v == null)) continue;
    const ranked = [...(scores as { s: Section; v: number }[])].sort((a, b) => a.v - b.v);

    if (ranked[1].v - ranked[0].v < MIN_GAP) return null; // latest complete mock is indecisive — done
    const weakest = ranked[0].s;
    const strongest = ranked[2].s;
    const line = scores.map((x) => `${x.s} ${x.v}`).join(' · ');
    return {
      weakest,
      strongest,
      basis: `Your last mock (${line}) — ${weakest} needs the work`,
      takenOn: d.taken_on,
    };
  }
  return null;
}
