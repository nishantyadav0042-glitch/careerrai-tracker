import {
  tallySubmission, MIN_ACTIVE_QUESTIONS, MIN_ACTIVE_TIPS,
  VOTING_WINDOW_HOURS,
} from '@/lib/community-pipeline';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The recycling engine — the reason Daily Pick can never show an empty shelf.
//
// NO BARS LIVE HERE. Founder, 29 Jul ("don't set a bar") and again 7 Aug: the
// graduation model — wait for 5 votes, then feature at ≥85% or archive below —
// used to run in this file even after it was removed from the pick, silently
// extending under-voted items forever and shelving everything that missed a
// bar no real item could clear. A closed voting window now means exactly one
// thing: this item's ballot turn is over. Archived is a resting state, not a
// grade — archived items stay fully eligible for the Top Pick and rotate back
// onto the ballot whenever the shelf runs low.
//
// Runs daily (cron) and ALSO lazily from the voting route, because a cron that
// silently stops is exactly how a student ends up staring at a blank tab. Both
// paths call the same two functions, in the same order, and both are
// idempotent: running twice in a minute changes nothing the second time.

export interface RecycleResult {
  rested: number;      // ballot turns that ended (voting → archived)
  revived: number;     // brought back to keep the shelf stocked
  activeQuestions: number;
  activeTips: number;
}

/**
 * Step 1 — close every voting window that has expired.
 *
 * The item goes to 'archived' regardless of its votes: the window is a ballot
 * ROTATION, not an exam. Votes were counted while it ran and keep counting
 * whenever it returns; they decide the Top Pick order, never survival.
 * Existing 'featured' rows (minted by the retired bars model) are untouched —
 * they have no expiry and remain eligible everywhere.
 */
export async function resolveExpiredSubmissions(admin: any): Promise<{ rested: number }> {
  const nowIso = new Date().toISOString();
  const { data: expired } = await admin
    .from('student_submissions')
    .select('id')
    .eq('status', 'voting')
    .not('voting_ends_at', 'is', null)
    .lte('voting_ends_at', nowIso);

  if (!expired || expired.length === 0) return { rested: 0 };

  const ids = expired.map((r: any) => r.id as string);
  await admin.from('student_submissions')
    .update({ status: 'archived', voting_ends_at: null })
    .in('id', ids);
  return { rested: ids.length };
}

/**
 * Step 2 — keep the shelf stocked.
 *
 * If the active pool (voting + featured) for a kind is below its minimum,
 * archived items come back with a fresh voting window. Ranked by TOTAL votes
 * (attention — the same currency that orders the Top Pick queue), so what
 * students engaged with most returns first; ties go to the most recent.
 */
export async function ensureMinimumPool(admin: any): Promise<{ revived: number; activeQuestions: number; activeTips: number }> {
  const nowIso = new Date().toISOString();
  let revived = 0;

  // Same reasoning as the voting route: a plain .in() read plus a JS filter,
  // not a nested PostgREST or(and(...)) that CI cannot exercise.
  const { data: activeRows } = await admin
    .from('student_submissions')
    .select('kind, status, voting_ends_at')
    .in('status', ['voting', 'featured']);
  const isActive = (r: { status: string; voting_ends_at: string | null }) =>
    r.status === 'featured' || (r.voting_ends_at != null && r.voting_ends_at > nowIso);
  const counts: Record<string, number> = { question: 0, tip: 0 };
  for (const r of (activeRows ?? []) as { kind: string; status: string; voting_ends_at: string | null }[]) {
    if (isActive(r) && (r.kind === 'question' || r.kind === 'tip')) counts[r.kind] += 1;
  }

  for (const kind of ['question', 'tip'] as const) {
    const min = kind === 'question' ? MIN_ACTIVE_QUESTIONS : MIN_ACTIVE_TIPS;
    const shortfall = min - counts[kind];
    if (shortfall <= 0) continue;

    const { data: candidates } = await admin
      .from('student_submissions')
      .select('id')
      .eq('kind', kind).eq('status', 'archived')
      .order('created_at', { ascending: false })
      .limit(shortfall * 3);
    if (!candidates || candidates.length === 0) continue;

    // Rank the candidates by attention, best first.
    const ids: string[] = candidates.map((c: any) => c.id as string);
    const { data: votes } = await admin
      .from('submission_votes').select('submission_id, helpful').in('submission_id', ids);
    const tally = new Map<string, { yes: number; no: number }>();
    for (const v of votes ?? []) {
      const t = tally.get(v.submission_id as string) ?? { yes: 0, no: 0 };
      if (v.helpful) t.yes += 1; else t.no += 1;
      tally.set(v.submission_id as string, t);
    }
    const ranked = ids
      .map((id: string) => {
        const t = tally.get(id) ?? { yes: 0, no: 0 };
        return { id, votes: tallySubmission(t.yes, t.no).total };
      })
      .sort((a: { votes: number }, b: { votes: number }) => b.votes - a.votes)
      .slice(0, shortfall);

    const freshWindow = new Date(Date.now() + VOTING_WINDOW_HOURS * 3600_000).toISOString();
    for (const r of ranked) {
      await admin.from('student_submissions')
        .update({ status: 'voting', voting_ends_at: freshWindow }).eq('id', r.id);
      revived += 1;
      counts[kind] += 1;
    }
  }

  return { revived, activeQuestions: counts.question, activeTips: counts.tip };
}

/** Both steps, in order. Safe to call as often as you like. */
export async function recycleCommunityPool(admin: any): Promise<RecycleResult> {
  const r = await resolveExpiredSubmissions(admin);
  const m = await ensureMinimumPool(admin);
  return {
    rested: r.rested,
    revived: m.revived, activeQuestions: m.activeQuestions, activeTips: m.activeTips,
  };
}
