import { createAdminClient } from '@/lib/supabase/admin';
import { daysSinceLastLog } from '@/lib/streak-utils';
import { SITE_URL } from '@/lib/site';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Tonight's Mission — the founder's execution surface, not analytics. At 7 PM
// the founder opens ONE page and works a queue of ready-to-send missions:
// this student, this reason, this exact blunt message, one tap, next. No
// interpreting data, no writing, no searching, no repeats. This is the leap
// from "who needs attention" to "who + why + the exact thing to send now."

export type Objective = 'log' | 'reconnect' | 'buddy' | 'install' | 'winback';

export const OBJECTIVE_LABEL: Record<Objective, string> = {
  log: 'Get today’s log',
  reconnect: 'Reconnect notifications',
  buddy: 'Book a buddy call',
  install: 'Get the app installed',
  winback: 'Win back — long silent',
};

export type Likelihood = 'high' | 'medium' | 'low';

export interface MissionCard {
  studentId: string;
  name: string;
  firstName: string;
  phone: string | null;
  waNumber: string | null;
  objective: Objective;
  objectiveLabel: string;
  why: string[];
  likelihood: Likelihood;
  message: string;
  rank: number;
}

export interface RootCause {
  total: number;
  notInstalled: number;
  installedNotifOff: number;
  reachableNeverLogged: number;
  wasActiveNowSilent: number;
  activeRecently: number;
}

export interface MissionQueue { cards: MissionCard[]; rootCause: RootCause; sentToday: number }

function waNumber(phone: string | null): string | null {
  if (!phone) return null;
  let d = phone.replace(/\D/g, '');
  if (d.length === 10) d = '91' + d;
  else if (d.length === 11 && d.startsWith('0')) d = '91' + d.slice(1);
  return d.length === 12 && d.startsWith('91') ? d : null;
}

// The messages — Nishant's voice: short, blunt, Hinglish, one objective, warm.
// No invented facts, no fake stats. These match the founder's own examples.
function buildMessage(objective: Objective, first: string): string {
  switch (objective) {
    case 'log':
      return `Hi ${first}, Nishant here (jisne CareerRai banaya). Aaj app pe log nahi hua. Koi issue hai to seedha batao — main help karunga. Warna 2 min mein kar lo yaar.`;
    case 'reconnect':
      return `Hi ${first}, Nishant here. Tumhare reminders band ho gaye — isliye daily plan nahi pahunch raha. App ek baar kholo, wapas apne aap on ho jayega. Koi dikkat ho to batao.`;
    case 'buddy':
      return `Hi ${first}, Nishant here. Tum consistent padh rahe ho aur buddy bhi dekha. Ek personal mentor chahiye jo tumhara plan aur weak areas track kare? Bas YES bol do.`;
    case 'install':
      return `Hi ${first}, Nishant here. Plan ready hai par app install nahi hua — isliye daily plan aur reminders nahi bhej pa raha. 10 sec: ${SITE_URL} Chrome mein kholo → "Add to Home Screen".`;
    case 'winback':
      return `Hi ${first}, Nishant here. Kuch din se padhai ruk gayi. Sab theek? Aaj bas 20 min, ek topic — utna hi kaafi hai. Main saath hoon, bata do kahan atka.`;
  }
}

export async function buildMissionQueue(admin?: any, limit = 45): Promise<MissionQueue> {
  const db = admin ?? createAdminClient();
  const nowMs = Date.now();
  const istDay = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const istDayStart = istDay + 'T00:00:00+05:30';
  const since3d = new Date(nowMs - 3 * 86_400_000).toISOString();

  const [{ data: students }, { data: streaks }, { data: eng }, { data: events }, { data: notifs }, { data: outreach }] = await Promise.all([
    db.from('profiles').select('id, full_name, phone, onboarding_completed, app_installed, is_premium, buddy_id, notif_prefs, push_subscription')
      .eq('role', 'student').not('is_test_account', 'is', true).not('is_demo', 'is', true),
    db.from('streak_data').select('student_id, last_log_date'),
    db.from('student_engagement').select('student_id, buddy_cta_clicks, mock_opened'),
    db.from('student_events').select('user_id, session_id').gte('created_at', istDayStart),
    db.from('notifications').select('user_id, clicked_at').not('pushed_at', 'is', null).gte('pushed_at', new Date(nowMs - 7 * 86_400_000).toISOString()),
    db.from('founder_outreach').select('student_id, objective, action, snoozed_until, created_at').gte('created_at', since3d),
  ]);

  const lastLogById = new Map((streaks ?? []).map((s: any) => [s.student_id, s.last_log_date]));
  const engById = new Map((eng ?? []).map((e: any) => [e.student_id, e]));
  const openedPush = new Set<string>();
  for (const n of notifs ?? []) if (n.clicked_at) openedPush.add(n.user_id);
  // Sessions in the app today, per student.
  const sessionsToday = new Map<string, Set<string>>();
  for (const ev of events ?? []) {
    if (!ev.user_id) continue;
    if (!sessionsToday.has(ev.user_id)) sessionsToday.set(ev.user_id, new Set());
    sessionsToday.get(ev.user_id)!.add(ev.session_id ?? 'x');
  }

  // Dedupe memory: a student messaged (sent) in the last 3 days, or snoozed and
  // still under snooze, or skipped today, is out of tonight's queue.
  const excludeStudents = new Set<string>();
  let sentToday = 0;
  for (const o of outreach ?? []) {
    if (o.action === 'sent') {
      excludeStudents.add(o.student_id);
      if (new Date(o.created_at).toISOString().slice(0, 10) === new Date().toISOString().slice(0, 10)) sentToday++;
    }
    if (o.action === 'snoozed' && o.snoozed_until && new Date(o.snoozed_until).getTime() > nowMs) excludeStudents.add(o.student_id);
    if (o.action === 'skipped' && new Date(o.created_at).getTime() > nowMs - 20 * 3600_000) excludeStudents.add(o.student_id);
  }

  // Root-cause tree — where is everyone stuck (attack the biggest branch).
  const rc: RootCause = { total: (students ?? []).length, notInstalled: 0, installedNotifOff: 0, reachableNeverLogged: 0, wasActiveNowSilent: 0, activeRecently: 0 };

  const cards: MissionCard[] = [];
  for (const p of students ?? []) {
    const prefsPush = (p.notif_prefs as { push?: boolean } | null)?.push === true;
    const liveSub = p.push_subscription != null;
    const installed = p.app_installed === true;
    const onboarded = p.onboarding_completed === true;
    const dsl = daysSinceLastLog(lastLogById.get(p.id) as string | null | undefined);
    const e = engById.get(p.id) as any;
    const buddyTaps = (e?.buddy_cta_clicks as number | null) ?? 0;
    const sessions = sessionsToday.get(p.id)?.size ?? 0;
    const isPremium = p.is_premium === true;
    const hasBuddy = p.buddy_id != null;

    // ── Root-cause classification (all students) ──
    if (dsl != null && dsl <= 3) rc.activeRecently++;
    else if (!installed) rc.notInstalled++;
    else if (installed && !prefsPush && !liveSub) rc.installedNotifOff++;
    else if (dsl == null) rc.reachableNeverLogged++;
    else rc.wasActiveNowSilent++;

    if (excludeStudents.has(p.id)) continue;

    // ── Assign the single best mission ──
    let objective: Objective | null = null;
    if (onboarded && !installed) objective = 'install';
    else if (prefsPush && !liveSub) objective = 'reconnect';
    else if (!isPremium && !hasBuddy && buddyTaps >= 1 && dsl != null && dsl <= 3) objective = 'buddy';
    else if (onboarded && dsl != null && dsl >= 1 && dsl <= 7) objective = 'log';
    else if (onboarded && dsl == null && installed) objective = 'log';
    else if (onboarded && dsl != null && dsl >= 8) objective = 'winback';
    if (!objective) continue;
    if (isPremium && objective !== 'reconnect') continue; // paying students aren't a founder-growth target

    // ── Why (concrete, trusted signals) + likelihood ──
    const why: string[] = [];
    if (sessions > 0 && (dsl == null || dsl >= 1)) why.push(`opened the app ${sessions}× today but didn’t log — likely just forgot`);
    if (dsl === 0) why.push('logged today already');
    else if (dsl != null) why.push(`${dsl}d since last study`);
    else why.push('never logged a day');
    why.push(liveSub ? (openedPush.has(p.id) ? 'reminders ON · opens pushes' : 'reminders ON') : prefsPush ? 'reminders DIED' : 'reminders OFF');
    if (buddyTaps > 0) why.push(`tapped buddy ${buddyTaps}×`);
    if (!installed) why.push('never installed the app');

    let likelihood: Likelihood = 'medium';
    if (sessions > 0 && (dsl == null || dsl <= 3)) likelihood = 'high';
    else if (dsl != null && dsl <= 3) likelihood = 'high';
    else if (dsl != null && dsl >= 15) likelihood = 'low';

    // ── Rank (highest-recovery first) ──
    const objectiveWeight: Record<Objective, number> = { reconnect: 100, buddy: 95, log: 80, install: 60, winback: 40 };
    const likWeight = likelihood === 'high' ? 30 : likelihood === 'medium' ? 15 : 0;
    const sessionBoost = sessions > 0 ? 20 : 0;
    const rank = objectiveWeight[objective] + likWeight + sessionBoost - (dsl ?? 30) * 0.5;

    const first = (p.full_name ?? '').trim().split(' ')[0] || 'there';
    cards.push({
      studentId: p.id,
      name: p.full_name ?? 'Student',
      firstName: first,
      phone: p.phone ?? null,
      waNumber: waNumber(p.phone ?? null),
      objective,
      objectiveLabel: OBJECTIVE_LABEL[objective],
      why,
      likelihood,
      message: buildMessage(objective, first),
      rank,
    });
  }

  cards.sort((a, b) => b.rank - a.rank);
  return { cards: cards.slice(0, limit), rootCause: rc, sentToday };
}
