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

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated', code: 'AUTH_REQUIRED' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as SubmitInput;

  // ONE contract, shared shape with the client hint (lib/community-pipeline).
  const v = validateSubmission(body, SECTIONS, (t) => TOPIC_METADATA[t]?.section);
  if (!v.ok) return NextResponse.json({ error: v.error, code: v.code }, { status: 400 });
  const sub = v.value;

  const admin = createAdminClient();

  // One a day. Blocked/rejected attempts count too — retry-spam is spam.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from('student_submissions').select('id', { count: 'exact', head: true })
    .eq('student_id', user.id).gte('created_at', dayAgo);
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
    return NextResponse.json({ error: 'One share a day — make it your best one.', code: 'RATE_LIMITED' }, { status: 429 });
  }

  const displayName = randomDisplayName();

  // ── Text safety — tips AND typed questions run the same gate ──
  let textVerdict: Awaited<ReturnType<typeof checkTipSafety>> | null = null;
  if (sub.text) {
    textVerdict = await checkTipSafety(sub.text);
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

    imageVerdict = await checkImageSafety(sub.image, sub.imageMime);
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
    const { error: upErr } = await admin.storage
      .from('community-questions')
      .upload(imagePath, bytes, { contentType: sub.imageMime, cacheControl: '86400' });
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

  const { error } = await admin.from('student_submissions').insert({
    student_id: user.id,
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
  if (error) {
    console.error('[community] submission insert failed', error.message);
    return NextResponse.json({ error: 'Could not save. Please try again.', code: 'SERVER_ERROR' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Sent! Students will now vote on it. If they find it genuinely helpful, it becomes a featured pick for the whole community.',
  });
}
