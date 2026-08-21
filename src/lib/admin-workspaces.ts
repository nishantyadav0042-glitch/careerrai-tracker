// ── The admin panel's information architecture, in one place ────────────────
//
// Founder, 9 Aug, after reading the full inventory: "the problem is not a lack
// of features, it is information architecture. 32 pages, 31 APIs, several
// orphans — but a founder makes only 6-8 decisions a day. Organise by
// OPERATION, not by page. Twelve workspaces, and every daily responsibility
// has exactly one home."
//
// This file IS that structure. Two rules make it hold:
//
//   1. EVERY admin route appears here exactly once. A guard test walks
//      src/app/admin and fails the build if a page has no home or has two.
//      That is what makes the eleven orphans — /admin/health among them,
//      which called itself "the morning screen" and was linked from nowhere —
//      impossible rather than merely fixed.
//
//   2. A tab that has no data behind it is marked `planned`, never rendered as
//      a live number. Several asks in the reorg (Gemini cost, OCR failure
//      rate, MRR, call recordings, A/B tests) have NO source in the database
//      today: OCR failures return 422 and are never recorded, and token usage
//      has never been logged at all. Showing a confident "0" for those would
//      be the same class of defect as the cron that silently skipped students
//      and still reported success.

export type TabStatus =
  /** Backed by a real query today. */
  | 'live'
  /** The screen exists but has moved here from somewhere else. */
  | 'moved'
  /** No data source yet — needs instrumentation before it can be honest. */
  | 'planned';

export interface AdminTab {
  label: string;
  /** Route it renders, or null when `planned`. */
  href: string | null;
  status: TabStatus;
  /** For `planned`: what has to exist first. Shown to the founder, not hidden. */
  blockedOn?: string;
}

export interface AdminWorkspace {
  id: string;
  label: string;
  /** lucide-react icon name, resolved by the nav component. */
  icon: string;
  /** Landing route for the workspace. */
  href: string;
  /** One line: what job this workspace does. */
  purpose: string;
  tabs: AdminTab[];
}

export const WORKSPACES: AdminWorkspace[] = [
  {
    id: 'command',
    label: 'Command',
    icon: 'Home',
    href: '/admin',
    purpose: 'The five-minute morning screen. What needs you right now.',
    tabs: [
      { label: 'Today', href: '/admin', status: 'live' },
      { label: 'Launch', href: '/admin/launch', status: 'moved' },
      { label: 'Mission control', href: '/admin/mission-control', status: 'moved' },
    ],
  },
  {
    id: 'students',
    label: 'People',
    icon: 'Users',
    href: '/admin/people',
    purpose: 'Filter to any audience — subscription, buddy, activity — priority-sorted.',
    tabs: [
      { label: 'People', href: '/admin/people', status: 'live' },
      { label: 'Pipeline', href: '/admin/students/pipeline', status: 'live' },
      { label: 'Full list', href: '/admin/students', status: 'live' },
      // logged-today, live-streaks, wants-buddy and going-cold were retired
      // (10 Aug): pure duplicates of People filters — ?activity=today,
      // ?activity=going_cold, ?buddy=wants. Pages with bespoke ACTIONS stayed.
      { label: 'Streak breakers', href: '/admin/streak-breakers', status: 'moved' },
      { label: 'Momentum', href: '/admin/momentum', status: 'moved' },
    ],
  },
  {
    id: 'sales',
    label: 'Sales',
    icon: 'PhoneCall',
    href: '/admin/sales',
    purpose: 'The CRM. Who to call now, what was said, and what is due next.',
    tabs: [
      // THE CRM landing (21 Aug). It used to be /admin/leads, a flat signup
      // list, while the actual call deck — dispositions, callbacks, retries,
      // ownership — sat at /admin/sales with ZERO inbound links anywhere in
      // the codebase. The founder's report was exact: "the CRM is basically
      // not there." It was there; nothing could reach it.
      { label: 'Call queue', href: '/admin/sales', status: 'live' },
      { label: 'Leads', href: '/admin/leads', status: 'live' },
      { label: 'Performance', href: '/admin/sales-performance', status: 'moved' },
      { label: 'Buddy interest', href: '/admin/buddy-interest', status: 'live' },
      // The drill-down for the Command card's "Sales-ready to call" count —
      // the exact records behind that number, which is why it stays a page
      // rather than folding into the call queue (a count must always open
      // the rows it counted). It is a SIGNAL, not a second queue.
      { label: 'Sales-ready', href: '/admin/sales-queue', status: 'moved' },
      { label: 'Remind to log', href: '/admin/reminders', status: 'moved' },
      // What the rep actually sees, one tap away. Same canonical queue
      // (buildCallQueue), scoped to her book instead of the whole base.
      { label: 'Rep view', href: '/sales', status: 'live' },
      { label: 'Call recordings', href: null, status: 'planned', blockedOn: 'No call recording is captured anywhere today.' },
      { label: 'Rep assignment', href: null, status: 'planned', blockedOn: 'The owner column and the reassign API both exist; no admin UI calls it yet, so ownership can only move by API.' },
    ],
  },
  {
    id: 'buddies',
    label: 'Buddies',
    icon: 'HeartHandshake',
    href: '/admin/buddies',
    purpose: 'Mentors requiring attention — healthy mentors disappear.',
    tabs: [
      { label: 'Operations', href: '/admin/buddies', status: 'live' },
      // The whole roster — every mentor with their full profile. Operations
      // answers "who needs me"; this answers "who do I have". It used to hide
      // as a tab inside /admin/students, where the founder could not find it
      // (11 Aug: "there is no option where I can see all the buddies").
      { label: 'All mentors', href: '/admin/buddies/roster', status: 'live' },
      { label: 'Sessions', href: '/admin/buddies/sessions', status: 'live' },
    ],
  },
  {
    id: 'plan',
    label: 'Study plan',
    icon: 'CalendarRange',
    href: '/admin/plan-engine',
    purpose: 'The engine room. Verify a plan before a student ever sees it.',
    tabs: [
      { label: 'Integrity', href: '/admin/plan-engine', status: 'live' },
      // The screen that would have caught the Percentages loop on day two
      // instead of day eighteen (founder, 11 Aug). Every other measure —
      // streaks, logs, hours, tasks completed — read HEALTHY while a student
      // was being shown the same five topics. Only distinct-topic counting
      // sees it, and nothing counted it until now.
      { label: 'Coverage', href: '/admin/plan-coverage', status: 'live' },
      { label: 'Daily pick', href: '/admin/daily-pick', status: 'moved' },
      { label: 'Challenges', href: '/admin/challenges', status: 'moved' },
    ],
  },
  {
    id: 'ocr',
    label: 'OCR',
    icon: 'ScanLine',
    href: '/admin/ocr',
    purpose: 'Timetable and scorecard reading — volume, and what failed.',
    tabs: [
      { label: 'Uploads', href: '/admin/ocr', status: 'live' },
      { label: 'Failures', href: null, status: 'planned', blockedOn: 'A failed parse returns 422 and is never recorded. Needs a failure event first.' },
      { label: 'Cost', href: null, status: 'planned', blockedOn: 'Gemini token usage has never been logged.' },
    ],
  },
  {
    id: 'engagement',
    label: 'Engagement',
    icon: 'BellRing',
    href: '/admin/notification-health',
    purpose: 'Everything that keeps a student coming back.',
    tabs: [
      { label: 'Notification health', href: '/admin/notification-health', status: 'moved' },
      { label: 'Broadcast', href: '/admin/engagement/broadcast', status: 'live' },
      { label: 'Brain approvals', href: '/admin/brain', status: 'moved' },
    ],
  },
  {
    id: 'finance',
    label: 'Revenue',
    icon: 'IndianRupee',
    href: '/admin/revenue',
    purpose: 'Money requiring attention — healthy payments disappear.',
    tabs: [
      { label: 'Operations', href: '/admin/revenue', status: 'live' },
      { label: 'All payments', href: '/admin/payments', status: 'live' },
      { label: 'Coupons', href: '/admin/coupons', status: 'live' },
      // The IIM Buddy funnel lives under Revenue rather than Analytics on
      // purpose: it is the path to a payment, and its last two rows come from
      // the payment ledger. Keeping it beside the money stops a second,
      // event-only revenue picture growing in the analytics workspace.
      { label: 'IIM Buddy funnel', href: '/admin/buddy-funnel', status: 'live' },
      { label: 'Scholarships', href: '/admin/scholarships', status: 'live' },
      { label: 'MRR & cashflow', href: null, status: 'planned', blockedOn: 'Needs a subscription-ledger view; today only one-off payment rows exist.' },
    ],
  },
  {
    id: 'analytics',
    label: 'Analytics',
    icon: 'Activity',
    href: '/admin/analytics',
    purpose: 'One analytics home. Growth folded in — never two funnels.',
    tabs: [
      { label: 'Behaviour', href: '/admin/analytics', status: 'live' },
      // The Founder Funnel: where the 212 disappear — signup → onboarding →
      // Blueprint → first tick → first log → return, every number drilling to
      // the exact students. Distinct from /admin/growth (pre-signup wizard).
      { label: 'Activation', href: '/admin/funnel', status: 'live' },
      { label: 'Growth funnel', href: '/admin/growth', status: 'moved' },
      { label: 'Speed', href: '/admin/perf', status: 'moved' },
    ],
  },
  {
    id: 'ai',
    label: 'AI',
    icon: 'Sparkles',
    href: '/admin/ai',
    purpose: 'Every Gemini call: who fires it, how often, and what it cost.',
    tabs: [
      { label: 'Usage', href: '/admin/ai', status: 'live' },
      { label: 'Cost', href: '/admin/ai', status: 'live' },
      { label: 'Prompt testing', href: null, status: 'planned', blockedOn: 'No prompt-run store.' },
    ],
  },
  {
    id: 'ops',
    label: 'Operations',
    icon: 'Wrench',
    href: '/admin/system',
    purpose: 'System health — broken things surface, plus the operational toolbox.',
    tabs: [
      { label: 'System health', href: '/admin/system', status: 'live' },
      { label: 'Health', href: '/admin/health', status: 'moved' },
      { label: 'Sessions & video', href: '/admin/ops/video', status: 'live' },
      { label: 'Integrity', href: '/admin/ops/integrity', status: 'live' },
      { label: 'LIS health', href: '/admin/lis-health', status: 'moved' },
      { label: 'Mission', href: '/admin/mission', status: 'moved' },
      { label: 'Feature flags', href: null, status: 'planned', blockedOn: 'No flag store exists.' },
    ],
  },
];

/** Flat list of every route this structure claims. */
export function allRoutes(): string[] {
  return WORKSPACES.flatMap((w) => [w.href, ...w.tabs.map((t) => t.href)])
    .filter((h): h is string => !!h);
}

/** Which workspace owns a route — used to highlight the nav. */
export function workspaceForPath(pathname: string): AdminWorkspace | null {
  // Longest match wins, so /admin/students/x picks Students before Command's
  // /admin. Exact-match /admin is handled by the length ordering naturally.
  let best: AdminWorkspace | null = null;
  let bestLen = -1;
  for (const w of WORKSPACES) {
    for (const route of [w.href, ...w.tabs.map((t) => t.href)]) {
      if (!route) continue;
      const hit = route === '/admin' ? pathname === '/admin' : pathname.startsWith(route);
      if (hit && route.length > bestLen) { best = w; bestLen = route.length; }
    }
  }
  return best;
}

/**
 * Routes that exist as files but are deliberately NOT in the structure.
 *
 * Each needs a reason. This list is the only escape hatch from the one-home
 * rule, and the guard test prints it, so "we forgot" can never masquerade as
 * "we decided".
 */
export const UNLISTED: Record<string, string> = {
  '/admin/cat-leads': 'Retired stub — redirects to /admin/leads. Delete after merge.',
  '/admin/student/[id]': 'Detail page, reached from any student list. Not a nav destination.',
  '/admin/leads/[id]': 'Detail page, reached from the leads list. Not a nav destination.',
  '/admin/buddy/[id]': 'Buddy 360 detail, reached from the mentor roster. Not a nav destination.',
  '/admin/payment/[id]': 'Payment 360 detail, reached from payments. Not a nav destination.',
  '/admin/growth/channel/[channel]': 'The students behind one acquisition channel, reached by tapping a row in Growth. Not a nav destination.',
};
