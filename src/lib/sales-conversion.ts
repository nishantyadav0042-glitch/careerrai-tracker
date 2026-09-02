import { getStudentMomentum } from '@/lib/momentum';
import { profileFacts, type ProfileFact } from '@/lib/sales-profile-facts';
import { computeTopicMemory } from '@/lib/prep-memory-data';
import { TOPIC_METADATA } from '@/lib/topics-constants';
import { bandMeta } from '@/lib/momentum';
import { getRecommendedBuddiesForStudent } from '@/lib/buddy-match';
import { SITE_URL } from '@/lib/site';
import { SESSION_PRICE_PAISE, SESSION_MINUTES, CREDIT_WINDOW_DAYS } from '@/lib/session-credit';
import { resolveFocusSections, type WeakestSource } from '@/lib/focus-sections';
import { type DebriefRow } from '@/lib/mock-informed-focus';
import { getLogDateString } from '@/lib/streak-utils';
import { scoreConversion, conversionTier, mockPercentiles } from '@/lib/sales-score';
import { classifyLane, type LaneVerdict } from '@/lib/call-queue';

// FOUNDER RULING (20 Aug 2026): the 10-call experiment sells ONE offer — the
// Rs 299 single session. The price is imported from the checkout's own
// constant so script and checkout cannot quote different numbers. Sessions
// carry NO money-back promise (the credit toward Till-CAT within
// CREDIT_WINDOW_DAYS is a discount, not money back) — so this script makes
// no such claims, and the honesty guard fails the build if one creeps in.
const SESSION_RS = SESSION_PRICE_PAISE / 100;
import { isCovered } from './coverage-status';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Sales conversion intelligence — everything Priya reads BEFORE and DURING a
// call to convert one student. Not analytics: buying symptoms (why they'll
// say yes), the prep story to reference, tailored objection handling, the
// pitch, and the call history. One student at a time.

export interface Symptom { label: string; strong: boolean }
export interface Objection { objection: string; response: string }
export interface CallHistoryItem { at: string; actorId: string | null; activityType: string | null; channel: string | null; provenance: string | null; status: string | null; note: string | null }
/** One cell of the 14-day study strip — the single highest-value view for a
 *  retention call ("you studied 6 days straight and stopped Tuesday — what
 *  happened Tuesday?"). PRODUCT FACT layer: read from daily_reports, never
 *  writable from any sales surface. */
export interface StudyDay { date: string; logged: boolean }
export interface FollowupItem { id: number; dueAt: string; status: string; reason: string | null; channel: string | null; completedAt: string | null; outcome: string | null }
/** The merged interaction timeline: CRM activity + follow-up promises in one
 *  chronological stream. One canonical model — the rep page and any founder
 *  drill-down render THIS, never their own joins (founder rule, 24 Aug). */
export interface TimelineItem {
  at: string;
  kind: 'activity' | 'followup_created' | 'followup_closed';
  label: string;
  note: string | null;
  provenance: string | null;
}

export interface ConversionView {
  studentId: string; name: string; firstName: string; phone: string | null; waNumber: string | null;
  isPremium: boolean; hasBuddy: boolean;
  convScore: number; tier: 'hot' | 'warm' | 'cool'; momentumLabel: string; momentumScore: number;
  reachable: boolean; lastActivity: string;
  symptoms: Symptom[];
  prep: {
    sections: { section: string; finished: number; total: number; pct: number }[];
    strongSection: string | null; weakSection: string | null;
    /** WHICH rung of the shared evidence chain decided weakSection. A rep
     *  quoting a mock and a rep quoting a hard default are making different
     *  claims, and only one of them is a fact about the student. */
    weakestSource: WeakestSource;
    topUntouched: string[]; finished: number; started: number; untouched: number;
    activeDays14: number; openedMock: boolean;
  };
  objections: Objection[];
  pitch: string;
  history: CallHistoryItem[];
  status: string | null;
  recommendedBuddy: { name: string; percentile: number | null; college: string | null; reason: string | null } | null;
  /** Oldest → newest, exactly 14 entries (IST days). */
  studyStrip: StudyDay[];
  /** Latest mock debrief, if any — evidence, shown with its own date.
   *  Percentiles are plain numbers: the DB columns are JSONB and unwrapping
   *  happens once, in lib/sales-score (C0). */
  latestMock: { takenOn: string | null; overall: number | null; varc: number | null; dilr: number | null; qa: number | null } | null;
  followups: FollowupItem[];
  timeline: TimelineItem[];
  /** WHY this student is worth calling — the same verdict the queue card
   *  shows, so the reason survives a rep opening the student directly (C4). */
  /** NULL when no lane justifies contact today — the student is backlog. */
  lane: LaneVerdict | null;
  /** What the student said their problem was, in their own words, at signup. */
  painPoints: string[];
  /** The plain facts of the profile (lib/sales-profile-facts) — who this
   *  person is, before any judgement about them. Founder, 2 Sep. */
  profile: ProfileFact[];
}



function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}

export async function getSalesConversionView(admin: any, id: string): Promise<ConversionView | null> {
  const since14 = new Date(Date.now() - 14 * 86_400_000).toISOString().slice(0, 10);
  const [{ data: p }, momentum, { data: eng }, { data: acts }, { data: lead }, { data: strip14 }, { data: mocks }, { data: fups }, { data: coverage }] = await Promise.all([
    // The baseline + self-report columns are here because the SHARED focus
    // chain needs them (C1) — sales must not answer "what is this student
    // weak at" from a narrower input set than the student's own planner uses.
    admin.from('profiles').select('id, created_at, full_name, phone, is_premium, buddy_id, is_repeater, is_working_professional, push_subscription, pain_points, baseline_varc, baseline_dilr, baseline_qa, self_reported_weakest_section, self_reported_strongest_section, email, exam_target, attempt_year, attempt_number, category, college, course_year, work_ex_months, coaching_enrolled, hours_available, weekend_hours_available, study_target_hours, study_window, study_windows, target_percentile, dream_colleges, starting_percentile, last_year_percentile, previous_percentile, signup_source, attr_channel, app_installed, current_stage, biggest_blocker, success_goal, self_reported_weak_topic, onboarding_completed').eq('id', id).single(),
    getStudentMomentum(admin, id),
    admin.from('student_engagement').select('buddy_cta_clicks, mock_opened, intent_door_at, buddy_cta_last_at').eq('student_id', id).maybeSingle(),
    admin.from('sales_activity').select('created_at, actor_id, activity_type, channel, provenance, status, note').eq('student_id', id).order('created_at', { ascending: false }).limit(20),
    admin.from('lead_outreach').select('status').eq('student_id', id).maybeSingle(),
    // PRODUCT FACTS for the 360 (24 Aug foundation): the day-by-day pattern,
    // the latest mock, and the promise history. All read-only to sales.
    admin.from('daily_reports').select('report_date').eq('student_id', id).gte('report_date', since14),
    // Several debriefs, not one: the shared chain applies its own recency and
    // completeness rules, and reading only the newest row would quietly make
    // sales stricter than the planner.
    admin.from('mock_debriefs').select('taken_on, overall_percentile, varc, dilr, qa').eq('student_id', id).order('taken_on', { ascending: false }).limit(5),
    admin.from('sales_followup').select('id, due_at, status, reason, channel, created_at, completed_at, outcome').eq('student_id', id).order('due_at', { ascending: false }).limit(15),
    admin.from('topic_coverage').select('topic, status').eq('student_id', id),
  ]);
  if (!p || !momentum) return null;

  // ── 14-day study strip (oldest → newest, IST days) ──
  const loggedDays = new Set((strip14 ?? []).map((r: any) => r.report_date as string));
  const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const studyStrip: StudyDay[] = [];
  for (let i = 13; i >= 0; i--) {
    const date = new Date(Date.parse(todayIst) - i * 86_400_000).toISOString().slice(0, 10);
    studyStrip.push({ date, logged: loggedDays.has(date) });
  }

  // C0: varc/dilr/qa are JSONB ({percentile: n}). Unwrapped in ONE place so a
  // column shape can never reach JSX as an object again.
  const m0 = (mocks ?? [])[0] as any | undefined;
  const latestMock = m0
    ? { takenOn: m0.taken_on ?? null, ...mockPercentiles(m0, m0.overall_percentile) }
    : null;

  const followups: FollowupItem[] = (fups ?? []).map((f: any) => ({
    id: f.id, dueAt: f.due_at, status: f.status, reason: f.reason ?? null, channel: f.channel ?? null,
    completedAt: f.completed_at ?? null, outcome: f.outcome ?? null,
  }));

  // ── Merged interaction timeline (newest first) ──
  const timeline: TimelineItem[] = [];
  for (const a of acts ?? []) {
    timeline.push({
      at: a.created_at, kind: 'activity',
      label: a.activity_type === 'assigned' || a.activity_type === 'reassigned'
        ? 'Lead assigned' : `${a.channel === 'whatsapp' ? 'WhatsApp' : 'Call'} — ${String(a.status ?? 'logged').replace(/_/g, ' ')}`,
      note: a.note ?? null, provenance: a.provenance ?? null,
    });
  }
  for (const f of followups) {
    timeline.push({ at: (fups ?? []).find((x: any) => x.id === f.id)?.created_at ?? f.dueAt, kind: 'followup_created', label: `Follow-up promised for ${new Date(f.dueAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}`, note: f.reason, provenance: 'system_generated' });
    if (f.completedAt) timeline.push({ at: f.completedAt, kind: 'followup_closed', label: `Follow-up ${f.status === 'no_response' ? 'attempted — no response' : f.status}`, note: f.outcome, provenance: 'system_generated' });
  }
  timeline.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

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

  // ── Weak/strong section: THE shared chain, not a sales opinion (C1) ──
  //
  // This used to pick the least-covered section from the bars above. Coverage
  // is the BOTTOM rung of the canonical ladder (mock → self-report → baseline
  // → coverage → default), so a student whose 20 Aug mock says DILR could be
  // told "your weak area is VARC" by a rep while their own plan worked DILR.
  // The same resolver that api/next-action, api/plan/full and buddy-match use
  // now answers here too — and `weakestSource` tells the rep which rung spoke,
  // because a default is not a fact about a student.
  const focus = resolveFocusSections(
    p as Record<string, unknown>,
    ((coverage ?? []) as any[]).map((c) => ({ section: TOPIC_METADATA[c.topic as string]?.section ?? '', status: c.status as string })),
    ((mocks ?? []) as unknown) as DebriefRow[],
    getLogDateString(),
  );
  const weakSection = focus.weakest;
  const strongSection = focus.strongest;

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

  // ── Conversion score + tier: ONE implementation, shared with the queue ──
  const convSignals = { momentumScore: momentum.score, buddyTaps, mockOpened: mock, intentDoor, activeRecently: active };
  const conv = scoreConversion(convSignals);
  const tier = conversionTier(convSignals);

  // ── WHY this student is worth calling (C4) ──
  // The same verdict the queue card renders. Without this, a rep who opens a
  // student from search or a timeline link loses the reason entirely and has
  // to reconstruct it from raw numbers.
  const painPoints = (Array.isArray(p.pain_points) ? (p.pain_points as unknown[]) : [])
    .map((x) => String(x).replace(/_/g, ' ')).slice(0, 3);
  const lane = classifyLane({
    todayIst: new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }),
    createdAt: (p.created_at as string | null) ?? null,
    logDates: ((strip14 ?? []) as any[]).map((r) => r.report_date as string),
    buddyTaps, intentDoor, momentumScore: momentum.score,
  });

  // ── Objection playbook (tailored) ──
  // HONESTY RULE (20 Aug, Sales Phase 1 — same audit standard as the queue
  // script, 13 Aug): this playbook is read DURING a live call, so it may only
  // (26 grants, 0 activated) and the unconditional risk-free framing were
  // Rs 299 session objections — every claim below is deliverable today.
  const objections: Objection[] = [
    { objection: `"Rs ${SESSION_RS} for one call?"`, response: `It's ${SESSION_MINUTES} minutes one-on-one with an IIM student who has read your actual prep before the call — less than one mock test costs. And if you upgrade to the full buddy within ${CREDIT_WINDOW_DAYS} days, the Rs ${SESSION_RS} counts toward it.` },
    { objection: '"I\'m not sure it\'ll help me"', response: `That's exactly what the session answers. You're not committing to anything — ${SESSION_MINUTES} minutes, your real numbers on the table, and you leave with a written next step. One sitting and you know.` },
  ];
  if (weakSection) objections.push({ objection: '"I can manage on my own"', response: `You're strong in ${strongSection ?? 'some areas'}, but ${weakSection} is where marks are leaking. A buddy builds a focused ${weakSection} plan — that's the fastest score jump.` });
  if (momentum.band === 'champion' || momentum.band === 'on_track') objections.push({ objection: '"I already study daily"', response: 'Exactly — you\'re putting in the hours. A buddy makes sure those hours go to the right topics instead of guesswork. Same effort, more score.' });
  if (buddyTaps >= 1) objections.push({ objection: '"Let me think about it"', response: `You already looked at the buddy option, so part of you wants this. Don't decide the big plan today — do one session and decide with evidence. It credits toward the full plan if you upgrade within ${CREDIT_WINDOW_DAYS} days.` });

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
  const pitch = `${first}, you've been preparing seriously${weakSection ? ` and ${weakSection} is the area holding your score back` : ''}. Book one ${SESSION_MINUTES}-minute session with an IIM buddy — they review your actual preparation, find the one thing holding your score back, and you leave with a written next step.${buddyLine} It's Rs ${SESSION_RS}, one time. Book here: ${SITE_URL}/student/buddy`;

  return {
    studentId: id, name: p.full_name ?? 'Student', firstName: first, phone: p.phone ?? null, waNumber: waNumber(p.phone ?? null),
    isPremium: p.is_premium === true, hasBuddy: p.buddy_id != null,
    profile: profileFacts(p),
    convScore: conv, tier, momentumLabel: bandMeta(momentum.band).label, momentumScore: momentum.score,
    reachable, lastActivity: dsl == null ? 'never logged' : dsl === 0 ? 'logged today' : `${dsl}d since last study`,
    symptoms,
    prep: { sections, strongSection, weakSection, weakestSource: focus.weakestSource, topUntouched, finished, started, untouched, activeDays14: momentum.signals.activeDays14, openedMock: mock },
    objections,
    pitch,
    history: (acts ?? []).map((a: any) => ({ at: a.created_at, actorId: a.actor_id ?? null, activityType: a.activity_type ?? null, channel: a.channel ?? null, provenance: a.provenance ?? null, status: a.status, note: a.note })),
    status: (lead?.status as string | null) ?? null,
    recommendedBuddy,
    studyStrip,
    latestMock,
    followups,
    timeline,
    lane,
    painPoints,
  };
}
