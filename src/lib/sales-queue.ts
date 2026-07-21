import { createAdminClient } from '@/lib/supabase/admin';
import { getRosterMomentum, bandMeta, type MomentumBand } from '@/lib/momentum';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sales Opportunity Queue — the salesperson's daily driver. Not a lead list;
// a ranked queue of the students most likely to buy the Rs 999 Exam Buddy
// TODAY, each with a confident ready-to-send script and a one-tap status
// workflow. She invests her ~25 conversations/day into the highest-probability
// students, top-down — never a random list.

export type Tier = 'hot' | 'warm' | 'cool';

export interface SalesOpportunity {
  studentId: string; name: string; firstName: string; phone: string | null; waNumber: string | null;
  convScore: number; tier: Tier;
  momentumBand: MomentumBand; momentumLabel: string;
  why: string[]; lastActivity: string; script: string;
  status: string | null; // from lead_outreach
}

export interface SalesQueue { opportunities: SalesOpportunity[]; target: number; doneToday: number }

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}

// Confident, value-first, risk-removed. Two openers: one for students who
// signalled buddy intent, one for strong studiers who haven't yet.
function buildScript(first: string, tappedBuddy: boolean): string {
  const lead = tappedBuddy
    ? `${first}, you've been preparing seriously for CAT and you checked out the Exam Buddy on CareerRai.`
    : `${first}, you've been studying consistently on CareerRai — that's exactly when a mentor makes the biggest difference.`;
  return `${lead} An Exam Buddy is a personal mentor who tracks your plan, your weak areas and your mocks with you. It's Rs 999, and if you don't find real value you get a full refund — so there's no risk. You also get 3 free messages to start. Can I show you how it works? Bata do, details bhej deta hoon.`;
}

export async function buildSalesQueue(admin?: any): Promise<SalesQueue> {
  const db = admin ?? createAdminClient();
  const roster = await getRosterMomentum(db);
  // The buyable population: real students, free, no buddy yet.
  const free = roster.filter((r) => !r.isPremium && !r.hasBuddy);
  const ids = free.map((r) => r.id);
  if (ids.length === 0) return { opportunities: [], target: 25, doneToday: 0 };

  const [{ data: eng }, { data: doors }, { data: outreach }] = await Promise.all([
    db.from('student_engagement').select('student_id, mock_opened').in('student_id', ids),
    db.from('mentor_grants').select('student_id, door').in('student_id', ids),
    db.from('lead_outreach').select('student_id, status, next_follow_up, updated_at').in('student_id', ids),
  ]);
  const mockById = new Map((eng ?? []).map((e: any) => [e.student_id, e.mock_opened === true]));
  const doorById = new Map((doors ?? []).map((d: any) => [d.student_id, d.door]));
  const outById = new Map((outreach ?? []).map((o: any) => [o.student_id, o]));

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  let doneToday = 0;
  for (const o of outreach ?? []) {
    if (o.status && o.status !== 'not_contacted' && o.updated_at && new Date(o.updated_at).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) === today) doneToday++;
  }

  const opportunities: SalesOpportunity[] = [];
  for (const r of free) {
    const out = outById.get(r.id) as any;
    const status = (out?.status as string | null) ?? null;
    // Closed either way — off the queue.
    if (status === 'converted' || status === 'not_interested') continue;
    // A scheduled follow-up not yet due — hide until its date.
    if (status === 'follow_up' && out?.next_follow_up && out.next_follow_up > today) continue;

    const tappedBuddy = r.buddyCtaClicks >= 1;
    const mock = mockById.get(r.id) === true;
    const door = doorById.get(r.id) as string | undefined;
    const active = r.daysSinceLastLog != null && r.daysSinceLastLog <= 3;

    // Conversion score — intent weighs heaviest, then active momentum.
    let conv = Math.round(r.score * 0.35);
    if (r.buddyCtaClicks >= 2) conv += 30; else if (tappedBuddy) conv += 18;
    if (mock) conv += 8;
    if (door) conv += 12;
    if (active) conv += 15;

    const tier: Tier = (tappedBuddy && active) ? 'hot' : (tappedBuddy || mock || r.score >= 50) ? 'warm' : 'cool';

    const why: string[] = [];
    if (r.buddyCtaClicks > 0) why.push(`tapped buddy ${r.buddyCtaClicks}×`);
    if (door) why.push(`${door} door crossed`);
    if (mock) why.push('opened a mock');
    why.push(`momentum ${r.score} · ${bandMeta(r.band).label.toLowerCase()}`);
    if (status && status !== 'not_contacted') why.push(`status: ${status}`);

    opportunities.push({
      studentId: r.id, name: r.full_name ?? 'Student', firstName: (r.full_name ?? '').trim().split(' ')[0] || 'there',
      phone: r.phone, waNumber: waNumber(r.phone),
      convScore: conv, tier,
      momentumBand: r.band, momentumLabel: bandMeta(r.band).label,
      why,
      lastActivity: r.daysSinceLastLog == null ? 'never logged' : r.daysSinceLastLog === 0 ? 'logged today' : `${r.daysSinceLastLog}d since log`,
      script: buildScript((r.full_name ?? '').trim().split(' ')[0] || 'there', tappedBuddy),
      status,
    });
  }

  // Hottest first; cool leads with zero intent sink to the bottom.
  opportunities.sort((a, b) => b.convScore - a.convScore);
  return { opportunities, target: 25, doneToday };
}
