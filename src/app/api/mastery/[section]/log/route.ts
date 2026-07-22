import { NextRequest, NextResponse } from 'next/server';
import { getAuthUser } from '@/lib/auth';
import { createAdminClient } from '@/lib/supabase/admin';
import { loadMasteryState, saveTopicProgress, saveSwap } from '@/lib/mastery-state';
import { sectionConfig } from '@/lib/mastery-sections';
import type { ErrorType } from '@/lib/mastery-engine';

// POST /api/mastery/[section]/log — the Section-D write-back + swap, for any
// section. { action:'study'|'revision'|'swap', ... }

export async function POST(request: NextRequest, { params }: { params: Promise<{ section: string }> }) {
  const { section } = await params;
  const cfg = sectionConfig(section);
  if (!cfg) return NextResponse.json({ error: 'Unknown section' }, { status: 404 });

  const user = await getAuthUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const { data } = await admin.from('profiles')
    .select('qa_model_enabled, dilr_model_enabled, varc_model_enabled, qa_include_bonus, dilr_include_bonus, varc_include_bonus')
    .eq('id', user.id).single();
  const profile = data as Record<string, unknown> | null;
  if (!profile || profile[cfg.enabledCol] !== true) {
    return NextResponse.json({ error: 'Section not enabled' }, { status: 404 });
  }

  const body = await request.json().catch(() => ({}));
  const includeBonus = profile[cfg.bonusCol] === true;
  const state = await loadMasteryState(admin, user.id, cfg.key, cfg.graph.byName, includeBonus);
  const e = cfg.engine;

  if (body?.action === 'study') {
    const spec = cfg.graph.byName.get(body.topic);
    if (!spec) return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
    const sessionsDone = Math.max(0, Math.min(20, Number(body.sessionsDone) || 0));
    const gotIt = body.gotIt === true;
    const errorType: ErrorType | undefined = body.errorType === 'concept' || body.errorType === 'calculation' ? body.errorType : undefined;
    const result = e.applyStudySession(state, spec, { sessionsDone, gotIt, errorType });
    await saveTopicProgress(admin, user.id, cfg.key, e.progressFor(state, spec.topic));
    return NextResponse.json({ ok: true, ...result });
  }

  if (body?.action === 'revision') {
    const spec = cfg.graph.byName.get(body.topic);
    if (!spec) return NextResponse.json({ error: 'Unknown topic' }, { status: 400 });
    e.applyRevisionSession(state, spec, body.wentCold === true);
    await saveTopicProgress(admin, user.id, cfg.key, e.progressFor(state, spec.topic));
    return NextResponse.json({ ok: true });
  }

  if (body?.action === 'swap') {
    const slotName = body.slot === 'priority' || body.slot === 'secondary' ? body.slot : null;
    if (!slotName) return NextResponse.json({ error: 'Bad slot' }, { status: 400 });
    const res = e.swapTopic(state, slotName, body.topic);
    if (!res.ok) return NextResponse.json({ error: res.reason }, { status: 400 });
    await saveSwap(admin, user.id, cfg.key, slotName, body.topic);
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
