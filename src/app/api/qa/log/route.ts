import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadQaState, saveTopicProgress, saveSwap } from '@/lib/qa-state';
import { applyStudySession, applyRevisionSession, swapTopic, progressFor, type ErrorType } from '@/lib/qa-mastery-engine';
import { QA_TOPICS_BY_NAME } from '@/lib/qa-topic-graph';

// POST /api/qa/log — the daily log write-back (Section D) + swap.
//  { action:'study',    topic, sessionsDone, gotIt, errorType? }
//  { action:'revision', topic, wentCold }
//  { action:'swap',     slot:'priority'|'secondary', topic }

export async function POST(request: NextRequest) {
  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data: profile } = await admin.from('profiles').select('qa_model_enabled').eq('id', user.id).single();
  if (!profile?.qa_model_enabled) return NextResponse.json({ error: 'QA model not enabled' }, { status: 404 });

  const body = await request.json().catch(() => ({}));
  const action = body?.action;
  const state = await loadQaState(admin, user.id);

  if (action === 'study') {
    const spec = QA_TOPICS_BY_NAME.get(body.topic);
    if (!spec) return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
    const sessionsDone = Math.max(0, Math.min(20, Number(body.sessionsDone) || 0));
    const gotIt = body.gotIt === true;
    const errorType: ErrorType | undefined = body.errorType === 'concept' || body.errorType === 'calculation' ? body.errorType : undefined;
    const result = applyStudySession(state, spec, { sessionsDone, gotIt, errorType });
    await saveTopicProgress(admin, user.id, progressFor(state, spec.topic));
    return NextResponse.json({ ok: true, ...result });
  }

  if (action === 'revision') {
    const spec = QA_TOPICS_BY_NAME.get(body.topic);
    if (!spec) return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
    applyRevisionSession(state, spec, body.wentCold === true);
    await saveTopicProgress(admin, user.id, progressFor(state, spec.topic));
    return NextResponse.json({ ok: true });
  }

  if (action === 'swap') {
    const slotName = body.slot === 'priority' || body.slot === 'secondary' ? body.slot : null;
    if (!slotName) return NextResponse.json({ error: 'Bad slot' }, { status: 400 });
    const res = swapTopic(state, slotName, body.topic);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    await saveSwap(admin, user.id, slotName, body.topic);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
