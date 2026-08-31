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
//   tip      — plain text 15–150 chars. What the share sheet asks for since
//              31 Aug, and the only kind Daily Pick can promote.
//   question — a photo (with an optional caption up to 600 chars), or text the
//              safety screen reads as a doubt rather than advice. Lands in the
//              feed, never in the daily slot.
//
// Flow: automated SAFETY gate (the only pre-publication check) → live in the
// pool permanently, under a throwaway display name → ranked by student votes
// → the most useful takes the top slot for exactly one day. Educational
// quality is never moderated; the community decides it. One submission per
// student per day — the limit creates the quality.

const SECTIONS: string[] = KNOWLEDGE_GRAPH.map((s) => s.id);

const SENT_MESSAGE =
  'Sent! Students will now vote on it. If they find it genuinely helpful, it becomes a featured pick for the whole community.';

// Part 7 of the hardening spec: NEVER tell a student their share is live when
// it is actually held for review. With a Gemini outage, every submission goes
// to the safety hold — telling them all "students will now vote on it" was a
// lie that also burned their one-a-day. The status decides the sentence.
const HELD_MESSAGE =
  'We received it — it’s being checked before other students see it. No need to send it again.';

function sentBody(status: string, extra: Record<string, unknown> = {}) {
  return {
    ok: true,
    status,
    published: status === 'live',
    message: status === 'live' ? SENT_MESSAGE : HELD_MESSAGE,
    ...extra,
  };
}

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
      return NextResponse.json(sentBody(replay.status, { idempotent: true }));
    }
  }

  // One a day. Blocked/rejected attempts count too — retry-spam is spam.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count, error: countErr } = await admin
    .from('student_submissions').select('id', { count: 'exact', head: true })
    .eq('student_id', user.id).gte('created_at', dayAgo);
  // A failed count is UNKNOWN — it must neither waive the one-a-day limit
  // (fail-open) nor consume the student's attempt on a guess.
  if (countErr) {
    return NextResponse.json({ error: 'Could not check your shares right now. Please try again.', code: 'SUBMIT_UNAVAILABLE' }, { status: 503 });
  }
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

  // ── Image pre-checks before any AI runs ──
  let bytes: Buffer | null = null;
  if (sub.image && sub.imageMime) {
    bytes = Buffer.from(sub.image, 'base64');
    if (bytes.length < 1024) {
      return NextResponse.json({ error: 'That photo looks empty — try again', code: 'IMAGE_TOO_SMALL' }, { status: 400 });
    }
    if (bytes.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Photo must be under 4 MB', code: 'IMAGE_TOO_LARGE' }, { status: 400 });
    }
    timing.imageBytes = bytes.length;
  }

  // ── Safety — BOTH gates in parallel (hardening sprint, 21 Aug) ──
  // They are independent reads of independent content, and the first real
  // submission paid them serially inside a request a student was watching.
  const tSafety = Date.now();
  const [textVerdict, imageVerdict] = await Promise.all([
    sub.text ? checkTipSafety(sub.text) : Promise.resolve(null),
    sub.image && sub.imageMime ? checkImageSafety(sub.image, sub.imageMime) : Promise.resolve(null),
  ]);
  mark('safety', tSafety);

  if (textVerdict?.verdict === 'blocked') {
    // Generic message on purpose — echoing what tripped the filter teaches
    // how to evade it.
    return NextResponse.json({
      error: 'This can’t be shared. Keep it about CAT prep, with no links or contact details.',
      code: 'MODERATION_BLOCKED',
    }, { status: 400 });
  }
  if (imageVerdict?.verdict === 'blocked') {
    return NextResponse.json({
      error: 'This image can’t be shared. Upload a clear photo of a CAT practice question.',
      code: 'MODERATION_BLOCKED',
    }, { status: 400 });
  }

  // ── Progressive friction (Part 3): only a problematic photo earns a step ──
  // The primitive is ONE COHERENT LEARNING OBJECT — a DI set or a passage
  // with sub-questions is coherent and sails through. Only clearly UNRELATED
  // content or an unreadable photo asks the student to adjust, and the
  // response tells the client exactly which help to offer (crop vs retake).
  // 'unclear' is NEVER friction — doubt guides, it does not censor.
  if (imageVerdict?.verdict === 'ok') {
    if (imageVerdict.coherence === 'multiple') {
      return NextResponse.json({
        error: 'This photo looks like several different questions. Crop it to the one you mean and send again.',
        code: 'IMAGE_MULTIPLE_OBJECTS',
      }, { status: 400 });
    }
    if (imageVerdict.quality === 'blurry' || imageVerdict.quality === 'blank') {
      return NextResponse.json({
        error: 'This photo is hard to read. Retake it a little closer and steadier.',
        code: 'IMAGE_UNREADABLE',
      }, { status: 400 });
    }
  }

  // ── Storage — the image touches storage ONLY after the gate ──
  // A 'manual' verdict still uploads (a human must be able to see it to
  // review it) but the row stays held, which no student-facing query reads.
  let imagePath: string | null = null;
  if (bytes && sub.imageMime) {
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
  //
  // 31 Aug: the fallback is what decided this. When the screen returns kind
  // null (it says null whenever it is unsure, and it is unsure often on a
  // one-line hint), the row took `sub.kind` — which validation set to
  // 'question' for ALL unhinted text. So a student's hint was filed as a
  // question, never reached the hint shelf, and Daily Pick could only ever be
  // stocked by us. `sub.kind` is now 'tip' for text-only, so an unsure screen
  // lands on the thing the sheet actually asked for. An explicit 'question'
  // from the screen still wins — a typed doubt still goes to the feed.
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
    // Keyed off the STORED kind, not the validation band. They agreed before
    // only because both branches happen to carry the text for a text-only
    // share; keeping them keyed to different things is how they drift.
    payload: resolvedKind === 'tip'
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
      // The concurrent twin decided the status; report it truthfully.
      const { data: twin } = await admin
        .from('student_submissions').select('status')
        .eq('student_id', user.id).eq('request_id', requestId!).maybeSingle();
      return NextResponse.json(sentBody(twin?.status ?? 'pending', { idempotent: true }));
    }
    console.error('[community] submission insert failed', error.message);
    return NextResponse.json({ error: 'Could not save. Please try again.', code: 'SERVER_ERROR' }, { status: 500 });
  }

  timing.total = Date.now() - t0;
  // The 27-second question, answered with numbers instead of a guess. Raising
  // a timeout without knowing WHICH stage is slow would just hide it.
  console.error('[community-submit-timing]', JSON.stringify(timing));

  return NextResponse.json(sentBody(anyManual ? 'pending' : 'live'));
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
  return NextResponse.json({
    found: data != null,
    status: data?.status ?? null,
    message: data ? sentBody(data.status).message : null,
  });
}
