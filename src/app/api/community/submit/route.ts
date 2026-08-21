import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA, KNOWLEDGE_GRAPH } from '@/lib/topics-constants';
import { checkTipSafety, checkImageSafety } from '@/lib/community-safety';
import {
  MAX_IMAGE_BYTES, MAX_SUBMISSIONS_PER_DAY,
  randomDisplayName, validateSubmission, type SubmitInput,
} from '@/lib/community-pipeline';

export const maxDuration = 60;

// POST /api/community/submit — exactly two contribution types:
//
//   tip      — plain text ≤150 chars, section + topic mandatory
//   question — typed text OR a photo OR both (founder, 20 Aug: the purpose
//              is sharing a tough question as easily as possible — the
//              mandatory image was an implementation shortcut, not the
//              product), section mandatory, topic optional
//
// Flow: automated SAFETY gate (the only pre-publication check) → live in the
// pool permanently, under a throwaway display name → ranked by student votes
// → the most useful takes the top slot for exactly one day. Educational
// quality is never moderated; the community decides it. One submission per
// student per day — the limit creates the quality.

const SECTIONS: string[] = KNOWLEDGE_GRAPH.map((s) => s.id);

const SENT_MESSAGE =
  'Sent! Students will now vote on it. If they find it genuinely helpful, it becomes a featured pick for the whole community.';

export async function POST(request: NextRequest) {
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const mark = (k: string, from: number) => { timing[k] = Date.now() - from; };
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as SubmitInput;

  // ONE contract, shared shape with the client hint (lib/community-pipeline).
  const v = validateSubmission(body, SECTIONS, (t) => TOPIC_METADATA[t]?.section);
  if (!v.ok) return NextResponse.json({ error: v.error, code: v.code }, { status: 400 });
  const sub = v.value;

  const admin = createAdminClient();

  // ── Idempotency (21 Aug) ────────────────────────────────────────────────
  // The client stamps ONE id per share intent and reuses it across retries,
  // so the same intent can never become two submissions. This is checked
  // BEFORE the rate limit on purpose: a retry of a share that already landed
  // must return the success the student never got to see, not a 429 telling
  // them they already shared today when they believe nothing sent.
  const requestId = typeof (body as { requestId?: unknown }).requestId === 'string'
    ? (body as { requestId: string }).requestId : null;
  if (requestId) {
    const { data: replay, error: replayErr } = await admin
      .from('student_submissions').select('id, status')
      .eq('student_id', user.id).eq('request_id', requestId).maybeSingle();
    // A failed lookup is UNKNOWN, never "no previous submission" — answering
    // "not found" on an error is how a duplicate would get minted.
    if (replayErr) {
      return NextResponse.json({ error: 'Could not confirm your share. Please try again.', code: 'RECONCILE_UNAVAILABLE' }, { status: 503 });
    }
    if (replay) {
      return NextResponse.json({ ok: true, idempotent: true, status: replay.status, message: SENT_MESSAGE });
    }
  }

  // One a day. Blocked/rejected attempts count too — retry-spam is spam.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from('student_submissions').select('id', { count: 'exact', head: true })
    .eq('student_id', user.id).gte('created_at', dayAgo);
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
    // State, not backend rule. We only say "already in" after CONFIRMING the
    // row exists — a 429 is not by itself proof that their share landed.
    const { data: existing } = await admin
      .from('student_submissions').select('id, status')
      .eq('student_id', user.id).gte('created_at', dayAgo)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();
    return NextResponse.json(
      existing
        ? { error: 'Your share is already in — you can send another one tomorrow.', code: 'ALREADY_SHARED_TODAY', existingStatus: existing.status }
        : { error: 'One share a day — make it your best one.', code: 'RATE_LIMITED' },
      { status: 429 },
    );
  }

  const displayName = randomDisplayName();

  // ── Text safety — tips AND typed questions run the same gate ──
  let textVerdict: Awaited<ReturnType<typeof checkTipSafety>> | null = null;
  if (sub.text) {
    const tText = Date.now();
    textVerdict = await checkTipSafety(sub.text);
    mark('textSafety', tText);
    if (textVerdict.verdict === 'blocked') {
      // Generic message on purpose — echoing what tripped the filter teaches
      // how to evade it.
      return NextResponse.json({
        error: 'This can’t be shared. Keep it about CAT prep, with no links or contact details.',
        code: 'MODERATION_BLOCKED',
      }, { status: 400 });
    }
  }

  // ── Image path (optional now) ──
  let imagePath: string | null = null;
  let imageVerdict: Awaited<ReturnType<typeof checkImageSafety>> | null = null;
  if (sub.image && sub.imageMime) {
    const bytes = Buffer.from(sub.image, 'base64');
    if (bytes.length < 1024) {
      return NextResponse.json({ error: 'That photo looks empty — try again', code: 'IMAGE_TOO_SMALL' }, { status: 400 });
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Photo must be under 4 MB', code: 'IMAGE_TOO_LARGE' }, { status: 400 });
    }

    timing.imageBytes = bytes.length;
    const tImg = Date.now();
    imageVerdict = await checkImageSafety(sub.image, sub.imageMime);
    mark('imageSafety', tImg);
    if (imageVerdict.verdict === 'blocked') {
      return NextResponse.json({
        error: 'This image can’t be shared. Upload a clear photo of a CAT practice question.',
        code: 'MODERATION_BLOCKED',
      }, { status: 400 });
    }

    // The image touches storage ONLY after the gate. A 'manual' verdict still
    // uploads (a human must be able to see it to review it) but the row stays
    // 'pending', which no student-facing query reads.
    const ext = sub.imageMime === 'image/png' ? 'png' : sub.imageMime === 'image/webp' ? 'webp' : 'jpg';
    imagePath = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const tUp = Date.now();
    const { error: upErr } = await admin.storage
      .from('community-questions')
      .upload(imagePath, bytes, { contentType: sub.imageMime, cacheControl: '86400' });
    mark('storageUpload', tUp);
    if (upErr) {
      console.error('[community] image upload failed', upErr.message);
      return NextResponse.json({ error: 'Could not save the photo. Please try again.', code: 'IMAGE_UPLOAD_FAILED' }, { status: 500 });
    }
  }

  // Any 'manual' verdict on any part → pending (human review before students see it).
  const anyManual = textVerdict?.verdict === 'manual' || imageVerdict?.verdict === 'manual';
  const resolvedSection = sub.section ?? imageVerdict?.section ?? textVerdict?.section ?? null;
  // A photo is a question. For text-only, the safety screen already read the
  // words and said which it is — so the student never had to.
  const resolvedKind = sub.image ? 'question' : (textVerdict?.kind ?? sub.kind);

  const tIns = Date.now();
  const { error } = await admin.from('student_submissions').insert({
    student_id: user.id,
    request_id: requestId,
    kind: resolvedKind,
    topic: sub.topic,
    // Section: what the student picked, else what the safety screen inferred,
    // else null — a card without a section chip is fine, an extra dropdown in
    // front of a contribution is not.
    payload: sub.kind === 'tip'
      ? { text: sub.text, section: resolvedSection }
      : { section: resolvedSection, ...(sub.text ? { text: sub.text } : {}) },
    ...(imagePath ? { image_path: imagePath } : {}),
    display_name: displayName,
    // 'live' is permanent and votable (20 Aug: the 72h ballot retired — it
    // was closing votes on most of the visible feed). A 'manual' safety
    // verdict holds it at 'pending', which no student-facing query reads.
    status: anyManual ? 'pending' : 'live',
  });
  mark('insert', tIns);
  if (error) {
    // 23505 = the idempotency index fired: a concurrent delivery of the SAME
    // intent already created it. That is success, not failure.
    if ((error as { code?: string }).code === '23505') {
      return NextResponse.json({ ok: true, idempotent: true, message: SENT_MESSAGE });
    }
    console.error('[community] submission insert failed', error.message);
    return NextResponse.json({ error: 'Could not save. Please try again.', code: 'SERVER_ERROR' }, { status: 500 });
  }

  timing.total = Date.now() - t0;
  // The 27-second question, answered with numbers instead of a guess. Raising
  // a timeout without knowing WHICH stage is slow would just hide it.
  console.error('[community-submit-timing]', JSON.stringify(timing));

  return NextResponse.json({ ok: true, message: SENT_MESSAGE });
}

// GET /api/community/submit?requestId=… — did my share actually land?
//
// The reconciliation the client runs when the network died mid-send. It
// answers only about the caller's own submission, and it distinguishes
// "definitely not there" from "we could not check" — the whole point is that
// the student is never told their contribution failed when we do not know.
export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' }, { status: 401 });

  const requestId = request.nextUrl.searchParams.get('requestId');
  if (!requestId) return NextResponse.json({ error: 'requestId required', code: 'BAD_REQUEST' }, { status: 400 });

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('student_submissions').select('id, status')
    .eq('student_id', user.id).eq('request_id', requestId).maybeSingle();
  if (error) {
    return NextResponse.json({ error: 'Could not check right now.', code: 'RECONCILE_UNAVAILABLE' }, { status: 503 });
  }
  return NextResponse.json({ found: data != null, status: data?.status ?? null, message: data ? SENT_MESSAGE : null });
}
