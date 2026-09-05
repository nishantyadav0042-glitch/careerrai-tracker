import type { createAdminClient } from '@/lib/supabase/admin';
import { liveStreak } from '@/lib/streak-utils';

// Student DNA — the per-student behavioural fingerprint. Deterministic and
// EXPLAINABLE BY CONSTRUCTION (founder, 24 Jul: never return a bare number —
// every score carries the exact factors that produced it). Since scores are
// transparent rules (not ML), the explanation IS the computation, generated in
// the same place as the score — it can never drift out of sync with it. Raw
// `signals` stay for anything the explanation layer doesn't surface.
//
// Scores are 0-100. Higher = more of that thing (incl. churn_risk = more likely
// gone). purchase_intent is null once a student is premium. For every metric,
// a "positive" factor pushes the score UP and a "negative" factor pushes it
// DOWN — for churn_risk that means a positive factor is bad news, so read the
// summary text, not just the sign, when it matters.

type Admin = ReturnType<typeof createAdminClient>;
const DAY = 86_400_000;

export interface DnaProfileInput {
  id: string;
  created_at: string | null;
  onboarding_completed: boolean | null;
  app_installed: boolean | null;
  notif_prefs: Record<string, unknown> | null;
  is_premium: boolean | null;
  last_seen_at: string | null;
}

export interface Factor { label: string; weight: number; evidence: string }
export type Confidence = 'high' | 'medium' | 'low';

export interface Explanation {
  score: number | null;
  confidence: Confidence;
  positives: Factor[];
  negatives: Factor[];
  window: string;          // the evidence window this score looked at
  evidenceCount: number;   // how many underlying events/records support it
  summary: string;         // one plain-language sentence
  recommendedAction: string;
  impactHint: string;      // expected business impact of acting on this
}

export interface StudentDna {
  activation: number;
  consistency: number;
  momentum: number;
  purchase_intent: number | null;
  churn_risk: number;
  journey_stage: 'signed_up' | 'activated' | 'habitual' | 'premium' | 'dormant';
  signals: Record<string, unknown>;
  explanations: {
    activation: Explanation;
    consistency: Explanation;
    momentum: Explanation;
    purchase_intent: Explanation;
    churn_risk: Explanation;
  };
}

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(n)));
const dateNDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().split('T')[0];
const isoNDaysAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString();

export async function computeStudentDna(admin: Admin, p: DnaProfileInput): Promise<StudentDna> {
  const now = Date.now();

  const [{ data: logs }, { data: streak }, { data: events }] = await Promise.all([
    admin.from('daily_reports').select('report_date, study_duration').eq('student_id', p.id).gte('report_date', dateNDaysAgo(30)),
    admin.from('streak_data').select('current_streak, last_log_date').eq('student_id', p.id).maybeSingle(),
    admin.from('student_events').select('event, created_at, path').eq('user_id', p.id).gte('created_at', isoNDaysAgo(30)),
  ]);

  // ── logging cadence ──
  const logDates = new Set((logs ?? []).map((l) => l.report_date as string));
  const daysBack = (d: string) => Math.floor((now - Date.parse(d + 'T00:00:00')) / DAY);
  const inWindow = (start: number, end: number) => [...logDates].filter((d) => { const b = daysBack(d); return b >= start && b < end; }).length;
  const logDays30 = logDates.size;
  const logDays7 = inWindow(0, 7);
  const logDaysPrev7 = inWindow(7, 14);
  const lastLog = [...logDates].sort().reverse()[0] ?? null;
  // Live, not last-known: the DNA describes how a student studies NOW, and a
  // streak that ended a fortnight ago is not a behaviour they still have.
  const currentStreak = liveStreak(streak?.current_streak as number | null, streak?.last_log_date as string | null);

  // ── event signals ──
  const ev = events ?? [];
  const evCount = (name: string) => ev.filter((e) => e.event === name).length;
  const buddyPlanClicks = evCount('buddy_plan_click');
  const buddyUnlockOpens = evCount('buddy_unlock_open');
  const buddyCtaClicks = evCount('buddy_cta_click');
  const paywallViews = ev.filter((e) => (e.event === 'screen_view' || e.event === 'pageview') && typeof e.path === 'string' && (e.path as string).startsWith('/student/buddy')).length;

  // ── recency (real "last activity" across every signal) ──
  const lastEventAt = ev.reduce((m, e) => Math.max(m, Date.parse(e.created_at as string)), 0);
  const lastSeen = p.last_seen_at ? Date.parse(p.last_seen_at) : 0;
  const lastLogMs = lastLog ? Date.parse(lastLog + 'T00:00:00') : 0;
  const lastActivity = Math.max(lastEventAt, lastSeen, lastLogMs);
  const daysSinceActivity = lastActivity ? Math.floor((now - lastActivity) / DAY) : 999;
  const ageDays = p.created_at ? Math.floor((now - Date.parse(p.created_at)) / DAY) : 0;

  // ══════════════════ ACTIVATION ══════════════════
  const actFactors: { key: string; label: string; done: boolean }[] = [
    { key: 'onboarding', label: 'Completed onboarding', done: !!p.onboarding_completed },
    { key: 'install', label: 'Installed the app', done: !!p.app_installed },
    { key: 'notif', label: 'Switched on notifications', done: (p.notif_prefs as { push?: boolean } | null)?.push === true },
    { key: 'first_log', label: 'Logged at least once', done: logDays30 > 0 },
  ];
  const activation = actFactors.filter((f) => f.done).length * 25;
  const actPositives: Factor[] = actFactors.filter((f) => f.done).map((f) => ({ label: f.label, weight: 25, evidence: 'confirmed on profile' }));
  const actNegatives: Factor[] = actFactors.filter((f) => !f.done).map((f) => ({ label: f.label + ' — not yet', weight: -25, evidence: 'missing' }));
  const activationExpl: Explanation = {
    score: activation, confidence: 'high',
    positives: actPositives, negatives: actNegatives,
    window: 'account lifetime', evidenceCount: actFactors.length,
    summary: activation === 100
      ? 'Fully activated — onboarded, installed, notifications on, and has logged.'
      : `Missing: ${actFactors.filter((f) => !f.done).map((f) => f.label.toLowerCase()).join(', ')}.`,
    recommendedAction: activation < 100 ? 'Guide them through the exact missing step' : 'None — fully activated',
    impactHint: activation < 75 ? 'Closing this gap is the highest-leverage single fix for this student' : 'Low — already activated',
  };

  // ══════════════════ CONSISTENCY ══════════════════
  const consistency = clamp((logDays30 / 30) * 100);
  const consistencyExpl: Explanation = {
    score: consistency, confidence: ageDays >= 14 ? 'high' : ageDays >= 5 ? 'medium' : 'low',
    positives: logDays30 > 0 ? [{ label: `Logged ${logDays30} of the last 30 days`, weight: consistency, evidence: `${logDays30}/30 days` }] : [],
    negatives: logDays30 < 30 ? [{ label: `Missed ${30 - logDays30} of the last 30 days`, weight: -(100 - consistency), evidence: `${30 - logDays30}/30 days` }] : [],
    window: 'last 30 days', evidenceCount: logDays30,
    summary: `Logged ${logDays30} of the last 30 days (${consistency}% habit strength).`,
    recommendedAction: consistency < 40 ? 'Lower the daily-log friction or shift reminder timing' : 'Reinforce — habit is forming',
    impactHint: consistency < 40 ? 'Low consistency is the strongest predictor of churn on this app' : 'Sustaining this protects retention',
  };

  // ══════════════════ MOMENTUM ══════════════════
  const momentumDelta = logDays7 - logDaysPrev7;
  const momentum = clamp(50 + momentumDelta * 10);
  const momentumExpl: Explanation = {
    score: momentum, confidence: ageDays >= 14 ? 'high' : 'low',
    positives: momentumDelta > 0 ? [{ label: `Logged ${momentumDelta} more day(s) this week than last`, weight: momentumDelta * 10, evidence: `${logDays7} vs ${logDaysPrev7} days` }] : [],
    negatives: momentumDelta < 0 ? [{ label: `Logged ${Math.abs(momentumDelta)} fewer day(s) this week than last`, weight: momentumDelta * 10, evidence: `${logDays7} vs ${logDaysPrev7} days` }] : [],
    window: 'this week vs. last week', evidenceCount: logDays7 + logDaysPrev7,
    summary: momentumDelta === 0 ? 'Flat — same logging pace as last week.'
      : momentumDelta > 0 ? `Trending up: ${logDays7} days this week vs ${logDaysPrev7} last week.`
      : `Trending down: ${logDays7} days this week vs ${logDaysPrev7} last week.`,
    recommendedAction: momentum < 40 ? 'Re-engage before the trend compounds' : momentum > 60 ? 'Reinforce with positive feedback' : 'Monitor',
    impactHint: momentum < 40 ? 'Early warning — usually precedes a churn-risk rise within 2 weeks' : 'Good moment for a habit-reinforcing nudge',
  };

  // ══════════════════ PURCHASE INTENT ══════════════════
  let purchase_intent: number | null;
  let piExpl: Explanation;
  if (p.is_premium) {
    purchase_intent = null;
    piExpl = {
      score: null, confidence: 'high', positives: [], negatives: [],
      window: 'n/a', evidenceCount: 0,
      summary: 'Already premium — purchase intent is no longer tracked.',
      recommendedAction: 'None', impactHint: 'n/a',
    };
  } else {
    const piParts: { label: string; count: number; per: number }[] = [
      { label: 'Tapped a paid plan', count: buddyPlanClicks, per: 40 },
      { label: 'Opened the buddy-unlock sheet', count: buddyUnlockOpens, per: 20 },
      { label: 'Tapped the buddy call-to-action', count: buddyCtaClicks, per: 15 },
      { label: 'Viewed the buddy/paywall screen', count: paywallViews, per: 5 },
    ];
    purchase_intent = clamp(piParts.reduce((s, x) => s + x.count * x.per, 0));
    const piPositives = piParts.filter((x) => x.count > 0).map((x) => ({ label: x.label, weight: x.count * x.per, evidence: `${x.count}×` }));
    piExpl = {
      score: purchase_intent, confidence: piPositives.length >= 2 ? 'high' : piPositives.length === 1 ? 'medium' : 'low',
      positives: piPositives, negatives: [],
      window: 'last 30 days', evidenceCount: piParts.reduce((s, x) => s + x.count, 0),
      summary: piPositives.length === 0 ? 'No buddy or paywall engagement in the last 30 days.' : `Engaged with the paywall ${piParts.reduce((s, x) => s + x.count, 0)} time(s) in 30 days.`,
      recommendedAction: purchase_intent >= 40 ? 'Surface the offer now — testimonial or human nudge' : 'No conversion push needed yet',
      impactHint: purchase_intent >= 40 ? 'High-probability revenue — act within 24-48h before intent decays' : 'Low — premature to push',
    };
  }

  // ══════════════════ CHURN RISK ══════════════════
  const recencyBase =
    daysSinceActivity <= 1 ? 5 :
    daysSinceActivity <= 3 ? 25 :
    daysSinceActivity <= 6 ? 50 :
    daysSinceActivity <= 13 ? 75 : 95;
  let churn_risk = recencyBase;
  const crPositives: Factor[] = [{ label: `${daysSinceActivity} day(s) since last activity`, weight: recencyBase, evidence: `last seen ${daysSinceActivity}d ago` }];
  const crNegatives: Factor[] = daysSinceActivity <= 1 ? [{ label: 'Active very recently', weight: -95 + recencyBase, evidence: 'recent activity' }] : [];
  if (logDaysPrev7 > 0 && logDays7 < logDaysPrev7) {
    churn_risk = clamp(churn_risk + 10);
    crPositives.push({ label: 'Logging cadence is declining', weight: 10, evidence: `${logDays7} vs ${logDaysPrev7} days` });
  }
  if (logDays30 === 0 && ageDays > 3) {
    const floor = 80;
    if (churn_risk < floor) crPositives.push({ label: 'Signed up but never logged a single day', weight: floor - churn_risk, evidence: `0/30 days, ${ageDays}d since signup` });
    churn_risk = Math.max(churn_risk, floor);
  }
  const churnExpl: Explanation = {
    score: churn_risk, confidence: 'high',
    positives: crPositives, negatives: crNegatives,
    window: 'recency + last 14 days', evidenceCount: 1 + logDays7 + logDaysPrev7,
    summary: churn_risk >= 70 ? `High risk — quiet for ${daysSinceActivity} day(s)${logDaysPrev7 > logDays7 ? ' with a declining trend' : ''}.`
      : churn_risk >= 40 ? `Moderate risk — ${daysSinceActivity} day(s) quiet.`
      : `Low risk — active ${daysSinceActivity} day(s) ago.`,
    recommendedAction: churn_risk >= 70 ? 'Personal outreach, not another automated push' : churn_risk >= 40 ? 'Watch — one more quiet week escalates this' : 'None needed',
    impactHint: churn_risk >= 70 ? 'Direct revenue/retention risk — every day of delay lowers win-back odds' : 'Preventive — cheap to address now',
  };

  const habitual = logDays30 >= 12;
  const activated = activation >= 75;
  const journey_stage: StudentDna['journey_stage'] =
    daysSinceActivity >= 14 ? 'dormant' :
    p.is_premium ? 'premium' :
    habitual ? 'habitual' :
    activated ? 'activated' : 'signed_up';

  return {
    activation, consistency, momentum, purchase_intent, churn_risk, journey_stage,
    signals: {
      logDays30, logDays7, logDaysPrev7, currentStreak, lastLog,
      daysSinceActivity, ageDays,
      buddyPlanClicks, buddyUnlockOpens, buddyCtaClicks, paywallViews,
    },
    explanations: {
      activation: activationExpl,
      consistency: consistencyExpl,
      momentum: momentumExpl,
      purchase_intent: piExpl,
      churn_risk: churnExpl,
    },
  };
}
