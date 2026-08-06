import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { sanitizeBlocks, sanitizeTargets, type TimetableKind } from '@/lib/timetable';
import { applyCoachingTimetable } from '@/lib/timetable-apply';
import { audit } from '@/lib/integration-audit';

export const dynamic = 'force-dynamic';

// The buddy's pen on their student's coaching timetable.
//
// Founder, 7 Aug: "personally edit it with buddy — make it premium." The
// student uploads the Excel; the buddy corrects and curates it; the plan
// follows. Saving goes through the SAME applyCoachingTimetable as the
// student's own upload, so a buddy edit aligns coverage, rebuilds today's
// untouched plan, and moves the plan source exactly like an upload does —
// one consequence, whoever held the pen.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function authorizePair(admin: any, buddyUserId: string, studentId: string) {
  // The pairing is the authorization: this buddy may touch exactly the
  // students whose profile names them. Admins have their own surfaces.
  const { data: student } = await admin
    .from('profiles')
    .select('id, full_name, buddy_id, is_premium')
    .eq('id', studentId)
    .single();
  if (!student || student.buddy_id !== buddyUserId) return null;
  return student as { id: string; full_name: string | null; buddy_id: string; is_premium: boolean | null };
}

export async function GET(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const studentId = request.nextUrl.searchParams.get('studentId') ?? '';
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  const admin = createAdminClient();
  const student = await authorizePair(admin, user.id, studentId);
  if (!student) return NextResponse.json({ error: 'Not your student.' }, { status: 403 });

  const { data } = await admin
    .from('student_timetables')
    .select('blocks, targets, kind, syllabus_end_date, confirmed_at')
    .eq('student_id', studentId)
    .maybeSingle();

  return NextResponse.json({
    timetable: data
      ? {
          blocks: sanitizeBlocks(data.blocks),
          targets: sanitizeTargets(data.targets),
          kind: (data.kind as TimetableKind | null) ?? 'weekly',
          syllabusEndDate: data.syllabus_end_date ?? null,
          confirmedAt: data.confirmed_at,
        }
      : null,
  });
}

export async function PUT(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = (await request.json().catch(() => ({}))) as {
    studentId?: unknown; blocks?: unknown;
  };
  const studentId = typeof body.studentId === 'string' ? body.studentId : '';
  if (!studentId) return NextResponse.json({ error: 'studentId required' }, { status: 400 });

  // Same hard gate as every other block that reaches the database: the buddy's
  // editor is a client, and a client is never the authority.
  const blocks = sanitizeBlocks(body.blocks);
  if (blocks.length === 0) {
    return NextResponse.json({ error: 'A timetable needs at least one class.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const student = await authorizePair(admin, user.id, studentId);
  if (!student) return NextResponse.json({ error: 'Not your student.' }, { status: 403 });

  // Buddy edits replace the CLASSES; the targets and printed end date the
  // student's upload captured are kept as they were.
  const { data: existing } = await admin
    .from('student_timetables')
    .select('targets, kind, syllabus_end_date')
    .eq('student_id', studentId)
    .maybeSingle();

  try {
    const applied = await applyCoachingTimetable(admin, studentId, {
      blocks,
      targets: sanitizeTargets(existing?.targets),
      kind: ((existing?.kind as TimetableKind | null) ?? 'weekly'),
      syllabusEndDate: (existing?.syllabus_end_date as string | null) ?? null,
      // A buddy curating the timetable IS the mentorship working — the plan
      // follows it. (Their student can still flip to our plan in settings.)
      followCoaching: true,
      source: 'buddy',
    });

    await audit({
      subjectId: studentId, actorId: user.id, action: 'timetable.buddy_edited', ok: true,
      detail: { blocks: blocks.length, aligned: applied.aligned, planRebuilt: applied.planRebuilt },
    });

    return NextResponse.json({ ok: true, blocks: blocks.length, ...applied });
  } catch (e) {
    console.error('[buddy-timetable]', String(e));
    return NextResponse.json({ error: 'Could not save. Please try again.' }, { status: 500 });
  }
}
