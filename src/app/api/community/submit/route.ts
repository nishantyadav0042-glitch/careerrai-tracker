import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TOPIC_METADATA, KNOWLEDGE_GRAPH } from '@/lib/topics-constants';
import { checkTipSafety, checkImageSafety } from '@/lib/community-safety';
import { randomDisplayName, VOTING_WINDOW_HOURS, MAX_SUBMISSIONS_PER_DAY } from '@/lib/community-pipeline';

export const maxDuration = 60;

// POST /api/community/submit — exactly two contribution types (founder, 25 Jul):
//
//   tip      — plain text ≤150 chars, section + topic mandatory
//   question — a PHOTO, section mandatory, topic optional
//
// Flow: automated SAFETY gate (the only pre-publication check) → the voting
// pool for 72h, under a random display name → ranked by student votes → the
// best become featured curriculum. Educational quality is never moderated;
// the community decides it. One submission per student per day — the limit
// creates the quality.

const SECTIONS: string[] = KNOWLEDGE_GRAPH.map((s) => s.id);
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { kind, section, topic, tip, image, image_mime: imageMime } = body as {
    kind?: unknown; section?: unknown; topic?: unknown; tip?: unknown;
    image?: unknown; image_mime?: unknown;
  };

  if (kind !== 'tip' && kind !== 'question') {
    return NextResponse.json({ error: 'kind must be tip or question' }, { status: 400 });
  }
  if (typeof section !== 'string' || !SECTIONS.includes(section)) {
    return NextResponse.json({ error: 'Pick a section' }, { status: 400 });
  }
  // Topic: mandatory for tips (a tip must land somewhere in the curriculum),
  // optional for questions (the photo speaks for itself; friction stays low).
  const topicOk = typeof topic === 'string' && !!TOPIC_METADATA[topic] && TOPIC_METADATA[topic].section === section;
  if (kind === 'tip' && !topicOk) {
    return NextResponse.json({ error: 'Pick the topic your tip is about' }, { status: 400 });
  }

  const admin = createAdminClient();

  // One a day. Blocked/rejected attempts count too — retry-spam is spam.
  const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
  const { count } = await admin
    .from('student_submissions').select('id', { count: 'exact', head: true })
    .eq('student_id', user.id).gte('created_at', dayAgo);
  if ((count ?? 0) >= MAX_SUBMISSIONS_PER_DAY) {
    return NextResponse.json({ error: 'One share a day — make it your best one.' }, { status: 429 });
  }

  const votingEnds = new Date(Date.now() + VOTING_WINDOW_HOURS * 3600_000).toISOString();
  const displayName = randomDisplayName();

  if (kind === 'tip') {
    const text = typeof tip === 'string' ? tip.trim() : '';
    if (text.length < 15 || text.length > 150) {
      return NextResponse.json({ error: 'Tips are 15–150 characters — one sharp idea' }, { status: 400 });
    }

    const safety = await checkTipSafety(text);
    if (safety.verdict === 'blocked') {
      // Generic message on purpose — echoing what tripped the filter teaches
      // how to evade it.
      return NextResponse.json({ error: 'This can’t be shared. Keep it about CAT prep, with no links or contact details.' }, { status: 400 });
    }

    const { error } = await admin.from('student_submissions').insert({
      student_id: user.id, kind: 'tip', topic: topic as string,
      payload: { text, section },
      display_name: displayName,
      status: safety.verdict === 'ok' ? 'voting' : 'pending',
      voting_ends_at: votingEnds,
    });
    if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  } else {
    if (typeof image !== 'string' || typeof imageMime !== 'string' || !IMAGE_MIMES.includes(imageMime)) {
      return NextResponse.json({ error: 'Attach a photo of the question (JPG/PNG)' }, { status: 400 });
    }
    const bytes = Buffer.from(image, 'base64');
    if (bytes.length < 1024 || bytes.length > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Photo must be under 4 MB' }, { status: 400 });
    }

    const safety = await checkImageSafety(image, imageMime);
    if (safety.verdict === 'blocked') {
      return NextResponse.json({ error: 'This image can’t be shared. Upload a clear photo of a CAT practice question.' }, { status: 400 });
    }

    // The image touches storage ONLY after the gate. A 'manual' verdict still
    // uploads (a human must be able to see it to review it) but the row stays
    // 'pending', which no student-facing query reads.
    const ext = imageMime === 'image/png' ? 'png' : imageMime === 'image/webp' ? 'webp' : 'jpg';
    const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
    const { error: upErr } = await admin.storage
      .from('community-questions')
      .upload(path, bytes, { contentType: imageMime, cacheControl: '86400' });
    if (upErr) {
      console.error('[community] image upload failed', upErr.message);
      return NextResponse.json({ error: 'Could not save the photo. Please try again.' }, { status: 500 });
    }

    const { error } = await admin.from('student_submissions').insert({
      student_id: user.id, kind: 'question', topic: topicOk ? (topic as string) : null,
      payload: { section },
      image_path: path,
      display_name: displayName,
      status: safety.verdict === 'ok' ? 'voting' : 'pending',
      voting_ends_at: votingEnds,
    });
    if (error) return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    message: 'Sent! Students will now vote on it. If they find it genuinely helpful, it becomes a featured pick for the whole community.',
  });
}
