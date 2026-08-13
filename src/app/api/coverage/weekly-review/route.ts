import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import {
  isCoverageStatus, isForwardMove, isReviewDue, daysSinceReview,
  type CoverageStatus,
} from '@/lib/coverage-review';
import { normalizeStatus } from '@/lib/coverage-status';

export const maxDuration = 60;

// GET  — is a review due, and which topics should lead it.
// POST — apply the student's updates and stamp the checkpoint.

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const admin = createAdminClient();
  const { data: prof } = await admin
    .from('profiles')
    .select('coverage_reviewed_at, onboarding_completed, onboarding_last_activity_at, created_at')
    .eq('id', user.id).maybeSingle();

  const reviewedAt = (prof?.coverage_reviewed_at as string | null) ?? null;
  // Same anchor the layout gate uses: coverage is filled during onboarding, so
  // onboarding is the first review. Passing it here keeps this route and the
  // gate from disagreeing about whether a review is due — a disagreement would
  // render the sheet and then have it immediately close itself.
  const filledAt = (prof?.onboarding_last_activity_at as string | null) ?? (prof?.created_at as string | null) ?? null;
  const due = isReviewDue(reviewedAt, prof?.onboarding_completed === true, new Date(), filledAt);
  if (!due) return NextResponse.json({ due: false, topics: [] });

  const { data: rows } = await admin
    .from('topic_coverage')
    .select('topic, section, status, updated_at')
    .eq('student_id', user.id);

  // Lead with what actually moved since the last review — those are the rows
  // most likely to be out of date, and it turns a 48-topic chore into a short
  // confirm. Everything else stays reachable in the full matrix.
  const since = reviewedAt ? Date.parse(reviewedAt) : 0;
  const all = (rows ?? []).map((r) => ({
    topic: r.topic as string,
    section: (r.section as string) ?? TOPIC_METADATA[r.topic as string]?.section ?? 'QA',
    // Same normalisation as the write path — showing a finished topic as
    // "Not started" is how a student gets talked into downgrading it.
    status: normalizeStatus(r.status),
    touched: r.updated_at ? Date.parse(r.updated_at as string) > since : false,
  }));

  const touched = all.filter((t) => t.touched);
  const inFlight = all.filter((t) => !t.touched && t.status !== 'not_started' && t.status !== 'exam_ready');

  // Cap the list. A review that opens with forty rows gets dismissed, and a
  // dismissed review produces stale data that looks fresh.
  const focus = [...touched, ...inFlight].slice(0, 12);

  return NextResponse.json({
    due: true,
    daysSince: daysSinceReview(reviewedAt),
    neverReviewed: reviewedAt === null,
    topics: focus.map(({ topic, section, status }) => ({ topic, section, status })),
    totalTopics: all.length,
  });
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const { updates } = (await request.json().catch(() => ({}))) as { updates?: unknown };
  const admin = createAdminClient();

  let applied = 0;
  let rejected = 0;

  if (Array.isArray(updates) && updates.length > 0) {
    const { data: current } = await admin
      .from('topic_coverage').select('topic, section, status').eq('student_id', user.id);
    const byTopic = new Map(
      (current ?? []).map((r) => [r.topic as string, {
        section: r.section as string,
        // normalizeStatus, not a coerce-to-not_started. Flattening an
        // unrecognised value (the legacy 'mastered') to the bottom rung made
        // isForwardMove below wave through ANY tap — so the one screen we
        // made mandatory could silently downgrade a topic the student had
        // already finished. (Backbone audit, 13 Aug.)
        status: normalizeStatus(r.status),
      }]),
    );

    const nowIso = new Date().toISOString();
    const rowsToWrite: { student_id: string; section: string; topic: string; status: string; updated_at: string }[] = [];

    for (const u of (updates as unknown[]).slice(0, 60)) {
      if (!u || typeof u !== 'object') { rejected++; continue; }
      const { topic, status } = u as { topic?: unknown; status?: unknown };
      if (typeof topic !== 'string' || !isCoverageStatus(status)) { rejected++; continue; }

      // Must be a topic in our own taxonomy — never create rows for a name the
      // client invented.
      const meta = TOPIC_METADATA[topic];
      const existing = byTopic.get(topic);
      if (!meta && !existing) { rejected++; continue; }

      // Exam Ready is EARNED, never claimed. /api/coverage has always refused
      // to accept it from a UI; this route was validating only "is it a real
      // status" and "is it forward", so the one screen we made mandatory was
      // also the one place the rule leaked. Ten topics across six students had
      // self-declared Exam Ready through here with every section engine still
      // switched off — there was no other path they could have come from.
      if (status === 'exam_ready') { rejected++; continue; }

      const from = existing?.status ?? 'not_started';
      // Forward-only. See isForwardMove — a silent downgrade would rewrite the
      // student's history and skew every projection built on it.
      if (!isForwardMove(from, status)) { rejected++; continue; }
      if (from === status) continue; // no-op, not an error

      rowsToWrite.push({
        student_id: user.id,
        section: existing?.section ?? meta?.section ?? 'QA',
        topic,
        status,
        // Every other writer stamps this; omitting it here meant a topic
        // changed THROUGH the weekly review never counted as "touched" —
        // so the next review would not resurface it, and revision-due and
        // prep-memory recency (which key off updated_at) never learned the
        // student had moved it.
        updated_at: nowIso,
      });
    }

    if (rowsToWrite.length > 0) {
      const { error } = await admin
        .from('topic_coverage')
        .upsert(rowsToWrite, { onConflict: 'student_id,section,topic' });
      if (error) {
        console.error('[coverage-review] write failed', error.message);
        return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
      }
      applied = rowsToWrite.length;
    }
  }

  // Stamped even when nothing changed — "nothing moved this week" is a real,
  // valid answer, and refusing to record it would keep nagging a student who
  // already told us the truth.
  const nowIso = new Date().toISOString();
  const { error: stampErr } = await admin
    .from('profiles').update({ coverage_reviewed_at: nowIso }).eq('id', user.id);
  if (stampErr) {
    console.error('[coverage-review] stamp failed', stampErr.message);
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }

  // No server-side event here: the client fires 'coverage_reviewed' through
  // journey.ts (with full session context). This route used to insert a
  // second, context-less row for the same action — every count of this event
  // was 2x.

  return NextResponse.json({ ok: true, applied, rejected, reviewedAt: nowIso });
}
