import { ENTITY_GRAPH, entityRoute, type EntityKind } from './entity-graph';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = any;

// ── One search box for the whole system ─────────────────────────────────────
//
// Founder, 9 Aug: "I should be able to search a student, phone, email, buddy,
// coupon, payment, session — anything. One search box. Command palette on ⌘K,
// exactly like Linear."
//
// The search reads the SAME entity graph the profile pages read, so a result
// and the page it opens can never disagree about where an entity lives. Each
// hit carries the route from entity-graph, so "find it" and "open it" are one
// step.
//
// Deliberately narrow and fast: this runs on every keystroke, so it queries a
// handful of high-signal columns with a prefix/contains match and caps hard.
// It is a launcher, not a report.

export interface SearchHit {
  kind: EntityKind;
  id: string;
  title: string;
  subtitle: string;
  route: string;
}

const PER_KIND = 5;

/** Is the query a phone-shaped string? Then bias toward students by phone. */
function looksLikePhone(q: string): boolean {
  const digits = q.replace(/\D/g, '');
  return digits.length >= 5 && digits.length / q.length > 0.6;
}

export async function universalSearch(admin: Admin, rawQuery: string): Promise<SearchHit[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];

  const hits: SearchHit[] = [];
  const like = `%${q}%`;

  // People — students and buddies live in one table, split by role. Name or
  // phone; phone-shaped queries match on the digits.
  const peopleFilter = looksLikePhone(q)
    ? `phone.ilike.%${q.replace(/\D/g, '')}%`
    : `full_name.ilike.${like},phone.ilike.${like}`;

  const { data: people } = await admin
    .from('profiles')
    .select('id, full_name, phone, role, is_premium')
    .or(peopleFilter)
    .in('role', ['student', 'buddy'])
    .limit(PER_KIND * 2);

  for (const p of people ?? []) {
    const kind: EntityKind = p.role === 'buddy' ? 'buddy' : 'student';
    hits.push({
      kind,
      id: p.id as string,
      title: (p.full_name as string) ?? 'Unnamed',
      subtitle: [
        kind === 'buddy' ? 'Mentor' : p.is_premium ? 'Premium student' : 'Student',
        p.phone,
      ].filter(Boolean).join(' · '),
      route: entityRoute(kind, p.id as string),
    });
  }

  // Payments — by order id, which is what a founder pastes from Razorpay.
  const { data: payments } = await admin
    .from('student_payments')
    .select('id, razorpay_order_id, amount, status')
    .or(`razorpay_order_id.ilike.${like},razorpay_payment_id.ilike.${like}`)
    .limit(PER_KIND);

  for (const p of payments ?? []) {
    hits.push({
      kind: 'payment',
      id: p.id as string,
      title: `₹${((p.amount as number) ?? 0) / 100} · ${p.status}`,
      subtitle: (p.razorpay_order_id as string) ?? 'no order id',
      route: entityRoute('payment', p.id as string),
    });
  }

  // Coupons — by code.
  const { data: coupons } = await admin
    .from('coupons')
    .select('code')
    .ilike('code', like)
    .limit(PER_KIND);

  for (const c of coupons ?? []) {
    hits.push({
      kind: 'coupon',
      id: c.code as string,
      title: c.code as string,
      subtitle: 'Coupon',
      route: entityRoute('coupon', c.code as string),
    });
  }

  // Weighted order, per the co-founder review: the entities a founder acts on
  // most appear first. A student or a payment is almost always what they came
  // for; a coupon almost never. Without this, an alphabetical or insertion
  // order buries the useful hit under the incidental one.
  const RANK: Record<EntityKind, number> = {
    student: 0, payment: 1, buddy: 2, lead: 3, session: 4,
    plan: 5, timetable: 6, notification: 7, coupon: 8,
  };
  return hits.sort((a, b) => (RANK[a.kind] ?? 9) - (RANK[b.kind] ?? 9));
}

/**
 * Static navigation + action targets for the palette.
 *
 * The palette is not only search — it navigates and runs actions, "exactly
 * like Linear". These are the fixed destinations; search results are layered
 * on top. Kept here (not in the component) so a test can prove every route is
 * one the workspace registry actually owns.
 */
export interface PaletteCommand {
  id: string;
  title: string;
  hint: string;
  route: string;
  group: 'go' | 'act';
}

export const PALETTE_COMMANDS: PaletteCommand[] = [
  { id: 'go-command', title: 'Command center', hint: 'What needs you now', route: '/admin', group: 'go' },
  { id: 'go-students', title: 'Students', hint: 'Every student by segment', route: '/admin/students', group: 'go' },
  { id: 'go-buddies', title: 'Mentor roster', hint: 'Who can run a session', route: '/admin/buddies', group: 'go' },
  { id: 'go-sessions', title: 'Sessions', hint: 'What happened to each', route: '/admin/buddies/sessions', group: 'go' },
  { id: 'go-sales', title: 'Sales queue', hint: 'Call list, hottest first', route: '/admin/sales-queue', group: 'go' },
  { id: 'go-leads', title: 'Leads', hint: 'The CRM', route: '/admin/leads', group: 'go' },
  { id: 'go-plan', title: 'Plan engine', hint: 'Verify the intelligence', route: '/admin/plan-engine', group: 'go' },
  { id: 'go-ocr', title: 'OCR uploads', hint: 'Timetable reads', route: '/admin/ocr', group: 'go' },
  { id: 'go-ai', title: 'AI usage', hint: 'Every Gemini call', route: '/admin/ai', group: 'go' },
  { id: 'go-payments', title: 'Payments', hint: 'Revenue and refunds', route: '/admin/payments', group: 'go' },
  { id: 'go-analytics', title: 'Analytics', hint: 'One funnel', route: '/admin/analytics', group: 'go' },
  { id: 'go-ops', title: 'Operations', hint: 'Health, jobs, integrity', route: '/admin/system', group: 'go' },
  { id: 'act-broadcast', title: 'Send a broadcast', hint: 'Message every student', route: '/admin/engagement/broadcast', group: 'act' },
  { id: 'act-integrity', title: 'Check metric integrity', hint: 'Do the numbers agree', route: '/admin/ops/integrity', group: 'act' },
];
