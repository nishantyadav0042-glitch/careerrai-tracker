import { assembleFounderInbox } from './founder-inbox';
import { findSacredFailures } from './sacred-guard';
import { getAiCost } from './ai-cost';
import { readStudyTruth, studyHeadline, studyCaveat, type StudyTruth } from './study-truth';
import { readAllPromiseDebt, stalePromiseLine, PROMISE_STALE_DAYS, type PromiseDebtReading } from './promise-debt';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── The Founder Daily Digest — know the business before opening anything ─────
//
// Co-founder ask, 9 Aug: "Before opening any dashboard, I should already know
// the state of the business. New students, new premium, revenue, payment
// failures, premium without buddies, churn risk, OCR failures, notification
// health, and any critical alerts from the last 24 hours."
//
// Built from the OS pieces already standing — the Founder Inbox (open work),
// the sacred guard (critical alerts), and AI cost — plus three fresh 24-hour
// counts (new students, new premium, revenue). Nothing here is invented; every
// number is a query, and the Founder Score is the same one the Command Center
// shows, so the morning email and the live screen never disagree.

export interface DigestBlock {
  /** Founder Score, 0-100 — the one-glance health number. */
  score: number;
  new24h: { students: number; premium: number; revenueRupees: number };
  critical: { title: string; student: string }[];
  attention: { title: string; count: number }[];
  ai: { rupeesToday: number; spikeRatio: number | null };
  /**
   * Whether students are STUDYING — counted as people, not as log rows.
   *
   * Added 15 Sep 2026 because the number everyone had been quoting was wrong
   * in three ways at once: half of all "logs" record no study at all, ticking
   * a plan task writes the same row type as the daily-log form, and the whole
   * rise tracked the ad spend rather than any change in behaviour. See
   * lib/os/study-truth.
   */
  study: StudyTruth;
  /**
   * Students who were PROMISED a callback and are still waiting, by name.
   *
   * Founder's escalation, 15 Sep 2026: *"7 din se zyada overdue ho to wo alag
   * dikhe aur founder digest mein naam ke saath aaye, par deck se hate na."*
   *
   * Deliberately names people rather than counting them. Neelam had ten
   * promises older than a week — as a number that reads as a backlog to work
   * through; as ten names it reads as ten students who were told we would call
   * and were not. Only the second one gets acted on. Nothing here bumps,
   * expires or reorders a promise: the deck is untouched, this is the founder
   * being told.
   */
  promises: { rep: string; overdue: number; stale: number; line: string }[];
  /** A single opening sentence: the state of the business in one line. */
  headline: string;
}

export async function buildFounderDigest(admin: Admin, nowMs: number): Promise<DigestBlock> {
  const dayAgo = new Date(nowMs - 24 * 3_600_000).toISOString();

  const [inbox, alerts, ai, study, debt, newStudents, newPremium, revenue] = await Promise.all([
    assembleFounderInbox(admin, nowMs),
    findSacredFailures(admin, nowMs),
    getAiCost(admin, nowMs),
    readStudyTruth(admin, nowMs),
    // Never fails the digest: a promise reading we could not take is one
    // missing paragraph, not a morning without an email.
    readAllPromiseDebt(admin, nowMs).catch(() => [] as PromiseDebtReading[]),
    admin.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'student').gte('created_at', dayAgo).not('is_test_account', 'is', true),
    admin.from('profiles').select('id', { count: 'exact', head: true })
      .eq('role', 'student').eq('is_premium', true).gte('premium_since', dayAgo),
    admin.from('student_payments').select('amount').eq('status', 'paid').gte('paid_at', dayAgo),
  ]);

  const revenueRupees = Math.round((revenue.data ?? []).reduce((s: number, r: any) => s + (r.amount ?? 0), 0) / 100);
  // Only seats with a STALE promise. A counsellor whose promises are all
  // current has nothing to escalate, and a paragraph that prints every morning
  // regardless is a paragraph that stops being read.
  const promises = debt
    .filter((r) => r.stale.length > 0)
    .sort((a, b) => b.stale.length - a.stale.length)
    .map((r) => ({ rep: r.repName, overdue: r.overdue, stale: r.stale.length, line: stalePromiseLine(r) }));
  const critical = alerts.filter((a) => a.severity === 'critical');

  // The one-line state of the business.
  const headline = critical.length > 0
    ? `${critical.length} critical issue${critical.length === 1 ? '' : 's'} need you today — paid students at risk.`
    : inbox.items.length === 0
      ? 'All clear. Nothing critical, inbox empty — go build.'
      : `Score ${inbox.score}. ${inbox.items.length} item${inbox.items.length === 1 ? '' : 's'} to work through, nothing critical.`;

  return {
    score: inbox.score,
    new24h: {
      students: newStudents.count ?? 0,
      premium: newPremium.count ?? 0,
      revenueRupees,
    },
    critical: critical.map((a) => ({ title: a.title, student: a.student.name })),
    attention: inbox.items.map((i) => ({ title: i.title, count: i.count })),
    ai: { rupeesToday: ai.today.rupees, spikeRatio: ai.spikeRatio },
    study,
    promises,
    headline,
  };
}

/** The digest block as email HTML, to prepend to the existing daily digest. */
export function digestToHtml(d: DigestBlock): string {
  const scoreColour = d.score >= 90 ? '#047857' : d.score >= 70 ? '#0f766e' : d.score >= 50 ? '#b45309' : '#dc2626';

  const criticalHtml = d.critical.length > 0
    ? `<div style="margin-top:12px">
         <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#dc2626">🔴 Critical — paid students at risk</p>
         ${d.critical.map((c) => `<p style="margin:2px 0;font-size:13px;color:#292524">${c.title}</p>`).join('')}
       </div>`
    : '';

  const attentionHtml = d.attention.length > 0
    ? `<div style="margin-top:12px">
         <p style="margin:0 0 4px;font-size:13px;font-weight:700;color:#57534e">Needs you</p>
         ${d.attention.map((a) => `<p style="margin:2px 0;font-size:13px;color:#292524">• ${a.title}</p>`).join('')}
       </div>`
    : '';

  // People, then the caveat. The caveat is not optional decoration: without it
  // "logs" gets quoted as studying in the next conversation, which is exactly
  // what happened for a month.
  const caveat = studyCaveat(d.study);
  const studyHtml = `
    <div style="margin-top:12px;padding:10px;border-radius:8px;background:#f5f5f4">
      <p style="margin:0;font-size:13px;font-weight:700;color:#292524">Are they studying?</p>
      <p style="margin:4px 0 0;font-size:13px;color:#292524">${studyHeadline(d.study)}</p>
      ${caveat ? `<p style="margin:4px 0 0;font-size:11px;color:#78716c">${caveat}</p>` : ''}
    </div>`;

  // Above AI cost and below the study block: this is about students who are
  // owed something, which outranks what a month costs us to run.
  const promisesHtml = d.promises.length > 0
    ? `<div style="margin-top:12px;padding:10px;border-radius:8px;background:#fef2f2">
         <p style="margin:0;font-size:13px;font-weight:700;color:#b91c1c">Promised a call, still waiting (${PROMISE_STALE_DAYS}+ days)</p>
         ${d.promises.map((p) => `<p style="margin:4px 0 0;font-size:13px;color:#292524"><strong>${p.rep}</strong> — ${p.line}</p>`).join('')}
       </div>`
    : '';

  const spike = d.ai.spikeRatio != null && d.ai.spikeRatio > 2
    ? ` — <span style="color:#dc2626;font-weight:600">${d.ai.spikeRatio.toFixed(1)}× the daily norm</span>`
    : '';

  return `
    <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:20px;border-bottom:1px solid #e7e5e4">
      <p style="margin:0;font-size:13px;color:#78716c">${d.headline}</p>
      <div style="margin-top:10px;display:flex;align-items:center;gap:16px">
        <span style="font-size:34px;font-weight:700;color:${scoreColour}">${d.score}</span>
        <span style="font-size:12px;color:#78716c">Founder score</span>
      </div>
      <div style="margin-top:12px;font-size:13px;color:#292524">
        <b>Last 24h:</b> ${d.new24h.students} new students · ${d.new24h.premium} new premium · ₹${d.new24h.revenueRupees} revenue
      </div>
      <div style="margin-top:4px;font-size:13px;color:#292524">
        <b>AI cost today:</b> ₹${d.ai.rupeesToday.toFixed(2)}${spike}
      </div>
      ${studyHtml}
      ${criticalHtml}
      ${promisesHtml}
      ${attentionHtml}
    </div>`;
}
