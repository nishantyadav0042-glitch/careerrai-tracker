import Link from 'next/link';
import { requireAdmin } from '@/lib/admin-auth';
import { assembleFounderInbox, type Severity } from '@/lib/os/founder-inbox';
import { getRealStudents, getLoggedToday } from '@/lib/admin-filters';
import { CheckCircle2, ArrowRight, AlertOctagon, AlertTriangle, Circle } from 'lucide-react';

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

  const inbox = await assembleFounderInbox(admin, Date.now());

  // Context counts, computed after the inbox so the decisions load first.
  const students = await getRealStudents(admin);
  const logged = await getLoggedToday(admin, students);

  const tone = scoreTone(inbox.score);
  const cleared = inbox.items.length === 0;

  return (
    <div className="mx-auto max-w-3xl px-4 py-5 pb-20">
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

function ContextTile({ label, value, href }: { label: string; value: string | number; href: string }) {
  return (
    <Link href={href} className="rounded-2xl border border-stone-200 bg-white p-3.5 transition-colors hover:border-stone-400">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-stone-400">{label}</p>
      <p className="mt-1 text-[18px] font-bold leading-none text-stone-900">{value}</p>
    </Link>
  );
}
