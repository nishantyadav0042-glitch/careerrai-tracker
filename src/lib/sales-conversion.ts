import { getStudentMomentum } from '@/lib/momentum';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { bandMeta } from '@/lib/momentum';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';
import { SITE_URL } from '@/lib/site';
import { isCovered } from './coverage-status';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sales conversion intelligence — everything Priya reads BEFORE and DURING a
// call to convert one student. Not analytics: buying symptoms (why they'll
// say yes), the prep story to reference, tailored objection handling, the
// pitch, and the call history. One student at a time.

export interface Symptom { label: string; strong: boolean }
export interface Objection { objection: string; response: string }
export interface CallHistoryItem { at: string; actor: string | null; status: string | null; note: string | null }

export interface ConversionView {
  studentId: string; name: string; firstName: string; phone: string | null; waNumber: string | null;
  isPremium: boolean; hasBuddy: boolean;
  convScore: number; tier: 'hot' | 'warm' | 'cool'; momentumLabel: string; momentumScore: number;
  reachable: boolean; lastActivity: string;
  symptoms: Symptom[];
  prep: {
    sections: { section: string; finished: number; total: number; pct: number }[];
    strongSection: string | null; weakSection: string | null;
    topUntouched: string[]; finished: number; started: number; untouched: number;
    activeDays14: number; openedMock: boolean;
  };
  objections: Objection[];
  pitch: string;
  history: CallHistoryItem[];
  status: string | null;
  recommendedBuddy: { name: string; percentile: number | null; college: string | null; reason: string | null } | null;
}



function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}

export async function getSalesConversionView(admin: any, id: string): Promise<ConversionView | null> {
  const [{ data: p }, momentum, { data: eng }, { data: acts }, { data: lead }] = await Promise.all([
    admin.from('profiles').select('id, full_name, phone, is_premium, buddy_id, is_repeater, is_working_professional, push_subscription').eq('id', id).single(),
    getStudentMomentum(admin, id),
    admin.from('student_engagement').select('buddy_cta_clicks, mock_opened, intent_door_at, buddy_cta_last_at').eq('student_id', id).maybeSingle(),
    admin.from('sales_activity').select('created_at, actor, status, note').eq('student_id', id).order('created_at', { ascending: false }).limit(20),
    admin.from('lead_outreach').select('status').eq('student_id', id).maybeSingle(),
  ]);
  if (!p || !momentum) return null;

  const e = (eng ?? {}) as any;
  const buddyTaps = (e.buddy_cta_clicks as number | null) ?? 0;
  const mock = e.mock_opened === true;
  const intentDoor = e.intent_door_at != null;
  const dsl = momentum.signals.daysSinceLastLog;
  const active = dsl != null && dsl <= 3;
  const reachable = p.push_subscription != null;

  // ── Prep story (per-section coverage from real topic memory) ──
  let sections: ConversionView['prep']['sections'] = [];
  let topUntouched: string[] = [];
  let finished = 0, started = 0, untouched = 0;
  try {
    const memory = await computeTopicMemory(admin, id, { isRepeater: !!p.is_repeater, isWorkingProfessional: !!p.is_working_professional });
    const agg: Record<string, { finished: number; total: number }> = { VARC: { finished: 0, total: 0 }, DILR: { finished: 0, total: 0 }, QA: { finished: 0, total: 0 } };
    const untouchedByWeight: { topic: string; w: number }[] = [];
    for (const t of memory) {
      const meta = TOPIC_METADATA[t.topic];
      if (isCovered(t.status)) finished++;
      else if (t.status === 'learning') started++;
      else untouched++;
      if (!meta) continue;
      agg[meta.section].total++;
      if (isCovered(t.status)) agg[meta.section].finished++;
      else if (t.status === 'not_started' || t.status === 'untouched') untouchedByWeight.push({ topic: t.topic, w: meta.weightage });
    }
    sections = Object.entries(agg).filter(([, v]) => v.total > 0).map(([section, v]) => ({ section, finished: v.finished, total: v.total, pct: Math.round((v.finished / v.total) * 100) }));
    topUntouched = untouchedByWeight.sort((a, b) => b.w - a.w).slice(0, 3).map((x) => x.topic);
  } catch { /* topic memory best-effort — the rest of the view still stands */ }

  const withCoverage = sections.filter((s) => s.total > 0);
  const strongSection = withCoverage.length ? withCoverage.reduce((a, b) => (b.pct > a.pct ? b : a)).section : null;
  const weakSection = withCoverage.length ? withCoverage.reduce((a, b) => (b.pct < a.pct ? b : a)).section : null;

  // ── Buying symptoms (why they'll convert) ──
  const symptoms: Symptom[] = [];
  if (buddyTaps >= 2) symptoms.push({ label: `Tapped the buddy option ${buddyTaps} times — actively wants a mentor`, strong: true });
  else if (buddyTaps === 1) symptoms.push({ label: 'Opened the buddy option — curious about a mentor', strong: false });
  if (intentDoor) symptoms.push({ label: 'Came back to the buddy a second time (intent door) — strong signal', strong: true });
  if (momentum.signals.activeDays14 >= 5) symptoms.push({ label: `Studying consistently (${momentum.signals.activeDays14}/14 days) — serious about CAT`, strong: true });
  if (momentum.band === 'champion' || momentum.band === 'on_track') symptoms.push({ label: `Strong momentum (${momentum.score}) — invested in cracking it`, strong: true });
  if (mock) symptoms.push({ label: 'Opened a mock — taking real exam prep seriously', strong: false });
  if (active) symptoms.push({ label: 'Active in the last 3 days — strike while engaged', strong: false });
  if (weakSection) symptoms.push({ label: `Weakest in ${weakSection} — a clear pain a buddy fixes`, strong: false });

  // ── Conversion score + tier (same shape as the queue) ──
  let conv = Math.round(momentum.score * 0.35);
  if (buddyTaps >= 2) conv += 30; else if (buddyTaps === 1) conv += 18;
  if (mock) conv += 8; if (intentDoor) conv += 12; if (active) conv += 15;
  const tier: ConversionView['tier'] = (buddyTaps >= 1 && active) ? 'hot' : (buddyTaps >= 1 || mock || momentum.score >= 50) ? 'warm' : 'cool';

  // ── Objection playbook (tailored) ──
  const objections: Objection[] = [
    { objection: '"Rs 999 is too much"', response: 'It\'s less than a single coaching class — and there\'s a full refund if you don\'t find value. There is literally no risk.' },
    { objection: '"I\'m not sure it\'ll help me"', response: 'That\'s exactly why you get 3 free messages first — try the buddy, feel the value, then decide.' },
  ];
  if (weakSection) objections.push({ objection: '"I can manage on my own"', response: `You're strong in ${strongSection ?? 'some areas'}, but ${weakSection} is where marks are leaking. A buddy builds a focused ${weakSection} plan — that's the fastest score jump.` });
  if (momentum.band === 'champion' || momentum.band === 'on_track') objections.push({ objection: '"I already study daily"', response: 'Exactly — you\'re putting in the hours. A buddy makes sure those hours go to the right topics instead of guesswork. Same effort, more score.' });
  if (buddyTaps >= 1) objections.push({ objection: '"Let me think about it"', response: 'You already looked at the buddy, so you know you want the guidance. The only real question is risk — and the full refund removes it. Try the 3 free messages tonight.' });

  // Recommended buddy — a specific, relevant mentor beats "a buddy". Reuses the
  // same matching engine the student-facing showcase uses (section fit first).
  let recommendedBuddy: ConversionView['recommendedBuddy'] = null;
  try {
    const recs = await getRecommendedBuddiesForStudent(admin, id);
    const top = recs[0];
    if (top) recommendedBuddy = { name: top.full_name, percentile: top.cat_percentile, college: top.iim_converted ?? null, reason: top.reason };
  } catch { /* best-effort — the pitch still stands without a named buddy */ }

  const first = (p.full_name ?? '').trim().split(' ')[0] || 'there';
  const buddyLine = recommendedBuddy
    ? ` For you I'd pair ${recommendedBuddy.name}${recommendedBuddy.college ? ` (${recommendedBuddy.college})` : ''}${recommendedBuddy.reason ? ` — ${recommendedBuddy.reason.toLowerCase()}` : ''}.`
    : '';
  const pitch = `${first}, you've been preparing seriously${weakSection ? ` and ${weakSection} is the area holding your score back` : ''}. An Exam Buddy is a personal mentor who builds your plan around your weak areas and tracks your mocks with you.${buddyLine} It's Rs 999, full refund if you don't find value, and 3 free messages to start. Shall I set it up? App: ${SITE_URL}`;

  return {
    studentId: id, name: p.full_name ?? 'Student', firstName: first, phone: p.phone ?? null, waNumber: waNumber(p.phone ?? null),
    isPremium: p.is_premium === true, hasBuddy: p.buddy_id != null,
    convScore: conv, tier, momentumLabel: bandMeta(momentum.band).label, momentumScore: momentum.score,
    reachable, lastActivity: dsl == null ? 'never logged' : dsl === 0 ? 'logged today' : `${dsl}d since last study`,
    symptoms,
    prep: { sections, strongSection, weakSection, topUntouched, finished, started, untouched, activeDays14: momentum.signals.activeDays14, openedMock: mock },
    objections,
    pitch,
    history: (acts ?? []).map((a: any) => ({ at: a.created_at, actor: a.actor, status: a.status, note: a.note })),
    status: (lead?.status as string | null) ?? null,
    recommendedBuddy,
  };
}
