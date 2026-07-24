import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { authorizedCron } from '@/lib/cron-auth';
import { sendAdminAlert } from '@/lib/email';

export const maxDuration = 60;

// Founder Memory (founder, 24 Jul: "the feature I would personally build
// next"). One email every morning, answer-first — never "here's a dashboard",
// always "here's what happened and what it means". Every line is read off
// real data already flowing through the pipeline (milestones, decision_log,
// student_dna_history, notifications, student_events); nothing is invented,
// and any line without enough sample size says so instead of guessing.
export async function GET(request: NextRequest) {
  if (!authorizedCron(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const admin = createAdminClient();
  const since = new Date(Date.now() - 24 * 3_600_000).toISOString();
  const prevSince = new Date(Date.now() - 48 * 3_600_000).toISOString();

  const [{ data: milestones }, { data: resolvedToday }, { data: pushToday }, { data: pushPrev }, { data: exits }] = await Promise.all([
    admin.from('student_milestones').select('milestone, meta').gte('created_at', since),
    admin.from('decision_log').select('action_id, business_impact').gte('outcome_at', since).not('outcome', 'is', null),
    admin.from('notifications').select('pushed_at, clicked_at').gte('pushed_at', since),
    admin.from('notifications').select('pushed_at, clicked_at').gte('pushed_at', prevSince).lt('pushed_at', since),
    admin.from('student_events').select('props').eq('event', 'screen_exit').gte('created_at', since).limit(2000),
  ]);

  const lines: string[] = [];

  // ── Milestones ──
  const mCount = (name: string) => (milestones ?? []).filter((m) => m.milestone === name).length;
  const crossed = mCount('student_crossed_purchase_threshold');
  const recovered = mCount('student_recovered_from_churn');
  const atRisk = mCount('student_became_at_risk');
  const powerUsers = mCount('student_became_power_user');
  const premium = mCount('student_became_premium');
  if (premium > 0) lines.push(`${premium} student${premium === 1 ? '' : 's'} became premium.`);
  if (crossed > 0) lines.push(`${crossed} student${crossed === 1 ? '' : 's'} crossed the purchase-intent threshold.`);
  if (recovered > 0) lines.push(`${recovered} previously at-risk student${recovered === 1 ? '' : 's'} recovered.`);
  if (atRisk > 0) lines.push(`${atRisk} student${atRisk === 1 ? '' : 's'} newly flagged at-risk — see the Action Queue.`);
  if (powerUsers > 0) lines.push(`${powerUsers} student${powerUsers === 1 ? '' : 's'} became a power user.`);

  // ── Closed-loop results (what we tried yesterday, and whether it worked) ──
  if (resolvedToday && resolvedToday.length > 0) {
    const byAction = new Map<string, { n: number; positive: number }>();
    for (const r of resolvedToday) {
      const cur = byAction.get(r.action_id as string) ?? { n: 0, positive: 0 };
      cur.n++;
      if (r.business_impact === 'positive') cur.positive++;
      byAction.set(r.action_id as string, cur);
    }
    for (const [action, v] of byAction) {
      lines.push(`Brain recommendation "${action}" resolved for ${v.n} student${v.n === 1 ? '' : 's'} — ${v.positive} worked.`);
    }
  }

  // ── Notification performance trend ──
  const openRate = (rows: { pushed_at: string | null; clicked_at: string | null }[] | null) => {
    const sent = (rows ?? []).filter((r) => r.pushed_at).length;
    if (sent === 0) return null;
    const opened = (rows ?? []).filter((r) => r.clicked_at).length;
    return { sent, opened, pct: Math.round((opened / sent) * 100) };
  };
  const today = openRate(pushToday);
  const prev = openRate(pushPrev);
  if (today && prev) {
    const delta = today.pct - prev.pct;
    lines.push(`Notification open rate: ${today.pct}% today (${today.opened}/${today.sent}) vs ${prev.pct}% yesterday — ${delta === 0 ? 'flat' : delta > 0 ? `up ${delta}pt` : `down ${Math.abs(delta)}pt`}.`);
  } else if (today) {
    lines.push(`Notification open rate: ${today.pct}% today (${today.opened}/${today.sent}). Not enough data yesterday to compare.`);
  }

  // ── Biggest drop-off screen (real screen_exit data, aggregated honestly) ──
  const screenCounts = new Map<string, number>();
  for (const e of exits ?? []) {
    const props = e.props as { screen?: string; reason?: string } | null;
    if (props?.screen && props.reason === 'hidden') screenCounts.set(props.screen, (screenCounts.get(props.screen) ?? 0) + 1);
  }
  const topDropoff = [...screenCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDropoff && topDropoff[1] >= 3) lines.push(`Today's biggest drop-off: ${topDropoff[0]} (${topDropoff[1]} students left mid-screen there).`);

  // ── One honestly-computed pattern (never fabricated; only shown with real sample size) ──
  const { data: premiumStudents } = await admin.from('profiles').select('id, created_at').eq('role', 'student').eq('is_premium', true).limit(200);
  const { data: freeStudents } = await admin.from('profiles').select('id, created_at').eq('role', 'student').eq('is_premium', false).not('onboarding_completed', 'is', false).limit(200);
  const daysToFirstLog = async (ids: string[]): Promise<number[]> => {
    if (ids.length === 0) return [];
    const { data } = await admin.from('daily_reports').select('student_id, report_date').in('student_id', ids).order('report_date', { ascending: true });
    const seen = new Map<string, string>();
    for (const r of data ?? []) if (!seen.has(r.student_id as string)) seen.set(r.student_id as string, r.report_date as string);
    const created = new Map((premiumStudents ?? []).concat(freeStudents ?? []).map((p) => [p.id as string, p.created_at as string]));
    const out: number[] = [];
    for (const [sid, firstLog] of seen) {
      const c = created.get(sid);
      if (!c) continue;
      const days = Math.floor((Date.parse(firstLog + 'T00:00:00') - Date.parse(c)) / 86_400_000);
      if (days >= 0 && days <= 60) out.push(days);
    }
    return out;
  };
  const premiumIds = (premiumStudents ?? []).map((p) => p.id as string);
  const freeIds = (freeStudents ?? []).map((p) => p.id as string);
  const [premDays, freeDays] = await Promise.all([daysToFirstLog(premiumIds), daysToFirstLog(freeIds)]);
  const median = (arr: number[]) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const mp = median(premDays), mf = median(freeDays);
  if (premDays.length >= 5 && freeDays.length >= 5 && mp != null && mf != null) {
    lines.push(`Pattern: premium students logged their first day a median of ${mp} day(s) after signup, vs ${mf} for free students (n=${premDays.length} vs ${freeDays.length}).`);
  } else {
    lines.push(`Not enough data yet for a new pattern today (need at least 5 premium + 5 free students with a logged first day; have ${premDays.length} and ${freeDays.length}).`);
  }

  if (lines.length === 0) lines.push('No significant movement in the last 24 hours.');

  const html = `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:24px">
      <h2 style="font-size:20px;color:#1c1917">CareerRai Daily Intelligence</h2>
      <p style="color:#78716c;font-size:12px">${new Date().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' })} · last 24 hours</p>
      <ul style="color:#292524;line-height:1.8;padding-left:20px">
        ${lines.map((l) => `<li>${l}</li>`).join('')}
      </ul>
    </div>
  `;
  await sendAdminAlert('CareerRai Daily Intelligence', html);

  return NextResponse.json({ ok: true, lineCount: lines.length });
}

export { GET as POST };
