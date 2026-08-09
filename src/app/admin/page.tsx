import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { assembleFounderInbox, type Severity } from '@/lib/os/founder-inbox';
import { findSacredFailures } from '@/lib/os/sacred-guard';
import { getRealStudents, getLoggedToday, getSalesReadyToCall, getWantsBuddy } from '@/lib/admin-filters';
import { CheckCircle2, ArrowRight, AlertOctagon, AlertTriangle, Circle, ShieldAlert, Phone } from 'lucide-react';

// Always render live — a cached inbox showing work that is already cleared, or
// hiding work that just appeared, is worse than no inbox.
export const dynamic = 'force-dynamic';

// ── COMMAND CENTER = the Founder Inbox ──────────────────────────────────────
//
// Co-founder review, 9 Aug: "Forget dashboard, think inbox. Every widget ends
// with 'what should Nishant do?' When I clear the inbox, CareerRai is healthy.
// One score in the morning; click for the reasons."
//
// So this screen leads with the score and the open work, not with counts. The
// old summary tiles ("127 students", "logged today") move BELOW the fold as
// context — they answer "what is happening", which matters, but only after the
// screen has answered "what should I do".
//
// Every item here comes from lib/os/founder-inbox, where every number is a real
// query and every item carries the one action that clears it.

const SEV: Record<Severity, { ring: string; chip: string; Icon: typeof AlertOctagon; label: string }> = {
  critical: { ring: 'border-red-300', chip: 'bg-red-100 text-red-700', Icon: AlertOctagon, label: 'Critical' },
  high:     { ring: 'border-amber-300', chip: 'bg-amber-100 text-amber-800', Icon: AlertTriangle, label: 'High' },
  normal:   { ring: 'border-stone-200', chip: 'bg-stone-100 text-stone-600', Icon: Circle, label: 'Normal' },
};

function scoreTone(score: number): { text: string; bg: string; word: string } {
  if (score >= 90) return { text: 'text-emerald-700', bg: 'bg-emerald-50', word: 'Healthy' };
  if (score >= 70) return { text: 'text-teal-700', bg: 'bg-teal-50', word: 'Steady' };
  if (score >= 50) return { text: 'text-amber-700', bg: 'bg-amber-50', word: 'Needs work' };
  return { text: 'text-red-700', bg: 'bg-red-50', word: 'Under strain' };
}

export default async function CommandCenterPage() {
  const { admin } = await requireAdmin();
  const now = Date.now();

  // Sacred-student failures are computed FIRST and pinned ABOVE everything.
  // Co-founder rule: a paying student in a broken state is a P0 the system
  // surfaces before the founder has to look for it.
  const [alerts, inbox] = await Promise.all([
    findSacredFailures(admin, now),
    assembleFounderInbox(admin, now),
  ]);

  // Context counts + the revenue-opportunity numbers, after the decisions.
  const students = await getRealStudents(admin);
  const [logged, salesReady, wantsBuddy] = await Promise.all([
    getLoggedToday(admin, students),
    getSalesReadyToCall(admin, students),
    getWantsBuddy(admin),
  ]);

  const tone = scoreTone(inbox.score);
  const cleared = inbox.items.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
      {/* SACRED ALERTS — pinned to the very top, above the score. A paying
          student the system could not fix itself is the one thing that should
          reach the founder before they go looking. */}
      {alerts.length > 0 && (
        <div className="mb-4 space-y-2">
          {alerts.map((a) => (
            <div key={a.id} className={`rounded-2xl border-2 p-3.5 ${a.severity === 'critical' ? 'border-red-400 bg-red-50' : 'border-amber-300 bg-amber-50'}`}>
              <div className="flex items-start gap-2.5">
                <ShieldAlert className={`mt-0.5 h-4 w-4 shrink-0 ${a.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[14.5px] font-bold leading-snug text-stone-900">{a.title}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-stone-600">{a.rootCause}</p>
                  <p className="mt-1 text-[11px] text-stone-500">
                    {a.student.name}{a.student.phone ? ` · ${a.student.phone}` : ''}{a.amountRupees != null ? ` · ₹${a.amountRupees}` : ''}
                  </p>
                </div>
              </div>
              <div className="mt-2.5 flex items-center gap-2 pl-6.5">
                <Link href={a.actionRoute} className="inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-[12px] font-bold text-white">
                  {a.actionLabel} <ArrowRight className="h-3 w-3" />
                </Link>
                {a.student.phone && (
                  <a href={`https://wa.me/${a.student.phone.replace(/\D/g, '')}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[12px] font-semibold text-teal-700">
                    <Phone className="h-3 w-3" /> Call
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* THE SCORE — one number, and the reasons are the list below it. */}
      <div className={`mb-4 flex items-center justify-between rounded-2xl border border-stone-200 ${tone.bg} p-4`}>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-500">Founder score</p>
          <p className="mt-1 text-xs text-stone-600">
            {cleared ? 'Inbox clear — nothing needs you right now.' : `${inbox.items.length} thing${inbox.items.length === 1 ? '' : 's'} need you`}
          </p>
        </div>
        <div className={`text-right ${tone.text}`}>
          <p className="text-[34px] font-bold leading-none">{inbox.score}</p>
          <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wide">{tone.word}</p>
        </div>
      </div>

      {/* THE INBOX — open work, most severe first, each ending in an action. */}
      {cleared ? (
        <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" />
          <p className="mt-2 text-[15px] font-bold text-emerald-800">All clear.</p>
          <p className="mt-1 text-[12px] text-emerald-700">Every mentor has a room, every paying student has a buddy, nothing is going cold. Go build.</p>
        </div>
      ) : (
        <div className="mb-5 space-y-2">
          {inbox.items.map((item) => {
            const s = SEV[item.severity];
            return (
              <Link
                key={item.id}
                href={item.route}
                className={`block rounded-2xl border ${s.ring} bg-white p-3.5 transition-colors hover:border-stone-400`}
              >
                <div className="flex items-start gap-2.5">
                  <s.Icon className={`mt-0.5 h-4 w-4 shrink-0 ${item.severity === 'critical' ? 'text-red-600' : item.severity === 'high' ? 'text-amber-600' : 'text-stone-400'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold leading-snug text-stone-900">{item.title}</p>
                    <p className="mt-0.5 text-[12px] leading-snug text-stone-500">{item.why}</p>
                  </div>
                </div>
                <div className="mt-2.5 flex items-center justify-between pl-6.5">
                  <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.chip}`}>
                    {s.label}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-stone-700">
                    {item.action} <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* REVENUE OPPORTUNITY — the money on the table, each a click from the
          people who represent it. Co-founder: "more valuable than generic
          analytics because it converts admin into a daily revenue queue." */}
      <div className="mb-2 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-orange-600">Revenue opportunity</p>
      </div>
      <div className="mb-5 grid grid-cols-2 gap-2">
        <RevenueTile emoji="🔥" label="Want a buddy, not subscribed" value={wantsBuddy.length} href="/admin/wants-buddy" hot={wantsBuddy.length > 0} />
        <RevenueTile emoji="📞" label="Sales-ready to call" value={salesReady.length} href="/admin/sales-queue" hot={salesReady.length > 0} />
        <RevenueTile emoji="💳" label="Payments to verify" value={alerts.filter((a) => a.id.startsWith('unlock:')).length} href="/admin/payments" hot={alerts.some((a) => a.id.startsWith('unlock:'))} />
        <RevenueTile emoji="🤝" label="Premium without a mentor" value={alerts.filter((a) => a.id.startsWith('buddy:')).length} href="/admin/students" hot={alerts.some((a) => a.id.startsWith('buddy:'))} />
      </div>

      {/* CONTEXT — what is happening, below what to do. */}
      <div className="mb-2 px-1">
        <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">Today, for context</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <ContextTile label="Students" value={students.length} href="/admin/students" />
        <ContextTile label="Logged today" value={`${logged.length}/${students.length}`} href="/admin/logged-today" />
        <ContextTile label="Press ⌘K" value="Search anything" href="/admin/students" />
      </div>
    </div>
  );
}

function RevenueTile({ emoji, label, value, href, hot }: { emoji: string; label: string; value: number; href: string; hot: boolean }) {
  return (
    <Link href={href} className={`rounded-2xl border p-3.5 transition-colors ${hot ? 'border-orange-300 bg-orange-50 hover:border-orange-400' : 'border-stone-200 bg-white hover:border-stone-400'}`}>
      <div className="flex items-center justify-between">
        <span className="text-[15px]" aria-hidden>{emoji}</span>
        <span className={`text-[22px] font-bold leading-none ${hot ? 'text-orange-700' : 'text-stone-900'}`}>{value}</span>
      </div>
      <p className="mt-1.5 text-[11.5px] font-semibold leading-snug text-stone-600">{label}</p>
    </Link>
  );
}

function ContextTile({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-stone-200 bg-white p-3.5 transition-colors hover:border-stone-400">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1 text-[18px] font-bold leading-none text-stone-900">{value}</p>
    </Link>
  );
}
