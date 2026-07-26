import {
  gradeSubmission, MIN_ACTIVE_QUESTIONS, MIN_ACTIVE_TIPS,
  VOTING_WINDOW_HOURS, FEATURE_BAR,
} from '@/lib/community-pipeline';

/* eslint-disable @typescript-eslint/no-explicit-any */

// The recycling engine — the reason Daily Pick can never show an empty shelf.
//
// Runs daily (cron) and ALSO lazily from the voting route, because a cron that
// silently stops is exactly how a student ends up staring at a blank tab. Both
// paths call the same two functions, in the same order, and both are
// idempotent: running twice in a minute changes nothing the second time.

export interface RecycleResult {
  graded: number;      // expired items given a verdict
  promoted: number;    // earned a permanent place on the shelf
  archived: number;    // didn't earn it (kept, not deleted)
  revived: number;     // brought back to keep the shelf stocked
  activeQuestions: number;
  activeTips: number;
}

/**
 * Step 1 — resolve everything whose voting window has closed.
 *
 * Items at or above the feature bar become 'featured' with `voting_ends_at`
 * cleared: they live on the shelf permanently and keep collecting votes, so a
 * question that genuinely helps students is asked again and again instead of
 * vanishing on day 15. Everything else is archived — kept for revival, never
 * deleted, because "not the best today" is not the same as "bad".
 *
 * Items that never reached MIN_VOTES_TO_JUDGE get their window EXTENDED rather
 * than judged: expiring an item nobody saw would punish it for our low
 * traffic, not for its quality.
 */
export async function resolveExpiredSubmissions(admin: any): Promise<{ graded: number; promoted: number; archived: number; extended: number }> {
  const nowIso = new Date().toISOString();
  const { data: expired } = await admin
    .from('student_submissions')
    .select('id, kind')
    .eq('status', 'voting')
    .not('voting_ends_at', 'is', null)
    .lte('voting_ends_at', nowIso);

  if (!expired || expired.length === 0) return { graded: 0, promoted: 0, archived: 0, extended: 0 };

  const ids = expired.map((r: any) => r.id as string);
  const { data: votes } = await admin
    .from('submission_votes').select('submission_id, helpful').in('submission_id', ids);

  const tally = new Map<string, { yes: number; no: number }>();
  for (const v of votes ?? []) {
    const t = tally.get(v.submission_id as string) ?? { yes: 0, no: 0 };
    if (v.helpful) t.yes += 1; else t.no += 1;
    tally.set(v.submission_id as string, t);
  }

  let promoted = 0, archived = 0, extended = 0;
  const freshWindow = new Date(Date.now() + VOTING_WINDOW_HOURS * 3600_000).toISOString();

  for (const row of expired) {
    const t = tally.get(row.id as string) ?? { yes: 0, no: 0 };
    const g = gradeSubmission(t.yes, t.no);

    if (g.verdict === 'pending') {
      // Too few votes to judge fairly — give it another window.
      await admin.from('student_submissions')
        .update({ voting_ends_at: freshWindow }).eq('id', row.id);
      extended += 1;
      continue;
    }
    if (g.verdict === 'feature') {
      await admin.from('student_submissions')
        .update({ status: 'featured', voting_ends_at: null, published_at: nowIso })
        .eq('id', row.id);
      promoted += 1;
      continue;
    }
    await admin.from('student_submissions')
      .update({ status: 'archived', voting_ends_at: null }).eq('id', row.id);
    archived += 1;
  }
  return { graded: promoted + archived, promoted, archived, extended };
}

/**
 * Step 2 — keep the shelf stocked.
 *
 * If the active pool (voting + featured) for a kind is below its minimum, the
 * highest-rated ARCHIVED items come back with a fresh voting window. Ranked by
 * helpful-rate so revival favours what students liked most, and only items
 * that were actually judged (never the unjudged) are candidates.
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

    // Rank the candidates by how well they actually did, best first.
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
        return { id, pct: gradeSubmission(t.yes, t.no).helpfulPct ?? 0 };
      })
      .sort((a: { pct: number }, b: { pct: number }) => b.pct - a.pct)
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
    graded: r.graded, promoted: r.promoted, archived: r.archived,
    revived: m.revived, activeQuestions: m.activeQuestions, activeTips: m.activeTips,
  };
}

/** Documented so the dashboard and the cron report the same bar. */
export const FEATURE_BAR_PCT = FEATURE_BAR * 100;
